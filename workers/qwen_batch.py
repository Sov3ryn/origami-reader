"""Studio rendering: faster-qwen3-tts (CUDA graphs) generating several lines of one voice at once.

Measured in Studio phase 0 (docs/STUDIO-PHASE0.md): 8 lines per step run about 3.5 times faster
than one line at a time, with identical audio at batch size one.

The upstream fast path captures CUDA graphs for one line. Here the talker decode step and
the 15-step code predictor are captured for a batch of B lines (left-padded prefill, one
shared cache position, per-line padding masks and rope deltas). Lines finish independently
(end token or their own token budget); the batch runs until all have finished.
"""
from __future__ import annotations

import time

import torch
from transformers import StaticCache

from faster_qwen3_tts.sampling import sample_logits


class BatchTalkerGraph:
    def __init__(self, talker_model, talker_config, batch, device="cuda", dtype=torch.bfloat16, max_seq_len=2048):
        self.model = talker_model
        self.batch = batch
        self.device = device
        self.dtype = dtype
        self.max_seq_len = max_seq_len
        self.hidden_size = talker_config.hidden_size
        self.num_layers = talker_config.num_hidden_layers
        self.static_cache = StaticCache(config=talker_config, max_cache_len=max_seq_len)
        self.input_buf = torch.zeros(batch, 1, self.hidden_size, dtype=dtype, device=device)
        self.output_buf = torch.zeros(batch, 1, self.hidden_size, dtype=dtype, device=device)
        self.cache_position = torch.zeros(1, dtype=torch.long, device=device)
        self.rope_deltas = torch.zeros(batch, 1, dtype=torch.float32, device=device)
        self.position_ids = torch.zeros(3, batch, 1, dtype=torch.float32, device=device)
        self.attn_mask = torch.zeros(batch, 1, 1, max_seq_len, dtype=dtype, device=device)
        self.mask_table = None
        self.graph = None

    def _init_cache_layers(self):
        config = self.model.config
        kv = getattr(config, "num_key_value_heads", config.num_attention_heads)
        head = getattr(config, "head_dim", config.hidden_size // config.num_attention_heads)
        dummy = torch.zeros(self.batch, kv, 1, head, dtype=self.dtype, device=self.device)
        for layer in self.static_cache.layers:
            if not layer.is_initialized:
                layer.lazy_initialization(dummy, dummy)

    def _build_masks(self, padding):
        # padding: [B, L] bool, True where a key may be attended to.
        L = self.max_seq_len
        keys = torch.arange(L, device=self.device)
        causal = keys.unsqueeze(0) <= keys.unsqueeze(1)  # [query pos, key pos]
        window = self.model.config.sliding_window
        if window is not None:
            causal &= keys.unsqueeze(0) > (keys.unsqueeze(1) - window)
        allowed = causal.unsqueeze(1) & padding.unsqueeze(0)  # [pos, B, L]
        zero = torch.zeros((), dtype=self.dtype, device=self.device)
        low = torch.full((), torch.finfo(self.dtype).min, dtype=self.dtype, device=self.device)
        self.mask_table = torch.where(allowed, zero, low).unsqueeze(2).unsqueeze(2)  # [pos, B, 1, 1, L]

    def _decode_step(self):
        out = self.model(
            inputs_embeds=self.input_buf,
            attention_mask=self.attn_mask,
            past_key_values=self.static_cache,
            cache_position=self.cache_position,
            position_ids=self.position_ids,
            use_cache=True,
        )
        self.output_buf.copy_(out.last_hidden_state)

    @torch.inference_mode()
    def capture(self, prefill_len=100, warmup=3):
        self._init_cache_layers()
        self._build_masks(torch.ones(self.batch, self.max_seq_len, dtype=torch.bool, device=self.device))
        self.cache_position[0] = prefill_len
        self.attn_mask.copy_(self.mask_table[prefill_len])
        for _ in range(warmup):
            self._decode_step()
        torch.cuda.synchronize()
        self.graph = torch.cuda.CUDAGraph()
        s = torch.cuda.Stream()
        s.wait_stream(torch.cuda.current_stream())
        with torch.cuda.stream(s):
            self._decode_step()
            torch.cuda.synchronize()
            with torch.cuda.graph(self.graph):
                self._decode_step()
        torch.cuda.current_stream().wait_stream(s)
        torch.cuda.synchronize()

    def prefill_kv(self, past_key_values):
        self.static_cache.reset()
        seq_len = 0
        for li in range(self.num_layers):
            layer = past_key_values.layers[li]
            seq_len = layer.keys.shape[2]
            if seq_len > self.max_seq_len:
                raise RuntimeError("prefill longer than max_seq_len")
            self.static_cache.update(layer.keys, layer.values, li, {"cache_position": torch.arange(seq_len, device=self.device)})
        return seq_len

    def set_generation_state(self, attention_mask, rope_deltas):
        pads = (attention_mask == 0).sum(dim=-1)
        padding = torch.ones(self.batch, self.max_seq_len, dtype=torch.bool, device=self.device)
        for b, p in enumerate(pads.tolist()):
            if p:
                padding[b, :p] = False
        self._build_masks(padding)
        if rope_deltas is None:
            self.rope_deltas.zero_()
        else:
            self.rope_deltas.copy_(rope_deltas.reshape(self.batch, 1).to(self.rope_deltas.dtype))

    @torch.inference_mode()
    def run(self, input_embeds, position):
        self.input_buf.copy_(input_embeds)
        self.cache_position[0] = position
        self.attn_mask.copy_(self.mask_table[position])
        delta = self.rope_deltas + float(position)
        self.position_ids.copy_(delta.unsqueeze(0).expand(3, -1, -1))
        self.graph.replay()
        return self.output_buf


class BatchPredictorGraph:
    def __init__(self, code_predictor, pred_config, talker_hidden, batch, device="cuda", dtype=torch.bfloat16,
                 top_k=50, top_p=1.0, temperature=0.9):
        cp = code_predictor
        self.batch = batch
        self.device = device
        self.dtype = dtype
        self.small_to_mtp = cp.small_to_mtp_projection
        self.pred_model = cp.model
        self.lm_heads = cp.lm_head
        self.codec_embeds = cp.model.codec_embedding
        self.hidden_size = pred_config.hidden_size
        self.num_codebooks = pred_config.num_code_groups - 1
        self.max_seq = 2 + self.num_codebooks
        self.top_k, self.top_p, self.temperature = top_k, top_p, temperature
        self.has_sliding = "sliding_attention" in getattr(self.pred_model.config, "layer_types", [])
        self.static_cache = StaticCache(config=pred_config, max_cache_len=self.max_seq)
        self.prefill_pos = torch.arange(2, device=device)
        self.decode_pos = [torch.tensor([2 + i], device=device) for i in range(self.num_codebooks - 1)]
        self.input_buf = torch.zeros(batch, 2, talker_hidden, dtype=dtype, device=device)
        self.output_tokens = torch.zeros(batch, self.num_codebooks, dtype=torch.long, device=device)
        self.graph = None

    def _init_cache_layers(self):
        config = self.pred_model.config
        kv = getattr(config, "num_key_value_heads", config.num_attention_heads)
        head = getattr(config, "head_dim", config.hidden_size // config.num_attention_heads)
        dummy = torch.zeros(self.batch, kv, 1, head, dtype=self.dtype, device=self.device)
        for layer in self.static_cache.layers:
            if not layer.is_initialized:
                layer.lazy_initialization(dummy, dummy)

    def _mask(self, cache_position):
        keys = torch.arange(self.max_seq, device=self.device)
        allowed = keys.unsqueeze(0) <= cache_position.unsqueeze(1)
        low = torch.finfo(self.dtype).min
        zero = torch.zeros((), dtype=self.dtype, device=self.device)
        mask = torch.where(allowed, zero, torch.full((), low, dtype=self.dtype, device=self.device)).unsqueeze(0).unsqueeze(0)
        if self.has_sliding:
            window = self.pred_model.config.sliding_window
            inside = keys.unsqueeze(0) > (cache_position.unsqueeze(1) - window)
            sliding = torch.where(allowed & inside, zero, torch.full((), low, dtype=self.dtype, device=self.device)).unsqueeze(0).unsqueeze(0)
            return {"full_attention": mask, "sliding_attention": sliding}
        return {"full_attention": mask}

    def _full_loop(self):
        h = self.small_to_mtp(self.input_buf)
        out = self.pred_model(inputs_embeds=h, attention_mask=self.prefill_attn, past_key_values=self.static_cache,
                              cache_position=self.prefill_pos, use_cache=True)
        logits = self.lm_heads[0](out.last_hidden_state[:, -1:, :])
        tok = sample_logits(logits[:, 0, :], temperature=self.temperature, top_k=self.top_k, top_p=self.top_p, do_sample=True)
        self.output_tokens[:, 0] = tok
        for cb in range(1, self.num_codebooks):
            emb = self.small_to_mtp(self.codec_embeds[cb - 1](tok.unsqueeze(1)))
            out = self.pred_model(inputs_embeds=emb, attention_mask=self.decode_attn[cb - 1], past_key_values=self.static_cache,
                                  cache_position=self.decode_pos[cb - 1], use_cache=True)
            logits = self.lm_heads[cb](out.last_hidden_state[:, -1:, :])
            tok = sample_logits(logits[:, 0, :], temperature=self.temperature, top_k=self.top_k, top_p=self.top_p, do_sample=True)
            self.output_tokens[:, cb] = tok

    @torch.inference_mode()
    def capture(self, warmup=3):
        self._init_cache_layers()
        self.prefill_attn = self._mask(self.prefill_pos)
        self.decode_attn = [self._mask(p) for p in self.decode_pos]
        for _ in range(warmup):
            self.static_cache.reset()
            self._full_loop()
        torch.cuda.synchronize()
        s = torch.cuda.Stream()
        s.wait_stream(torch.cuda.current_stream())
        with torch.cuda.stream(s):
            self.graph = torch.cuda.CUDAGraph()
            self.static_cache.reset()
            self._full_loop()
            torch.cuda.synchronize()
            self.static_cache.reset()
            with torch.cuda.graph(self.graph):
                self._full_loop()
        torch.cuda.current_stream().wait_stream(s)
        torch.cuda.synchronize()

    @torch.inference_mode()
    def run(self, pred_input):
        self.input_buf.copy_(pred_input)
        self.static_cache.reset()
        self.graph.replay()
        return self.output_tokens.clone()


class BatchedFastQwen:
    """Wraps a loaded FasterQwen3TTS and adds batched generation for one voice."""

    def __init__(self, fast, max_seq_len=2048):
        self.fast = fast
        self.m = fast.model.model
        self.graphs = {}
        self.max_seq_len = max_seq_len

    def _graphs(self, batch, temperature):
        key = (batch, temperature)
        if key not in self.graphs:
            m = self.m
            talker = m.talker
            tc = m.config.talker_config
            pred = BatchPredictorGraph(talker.code_predictor, talker.code_predictor.model.config, tc.hidden_size, batch,
                                       dtype=talker.dtype, temperature=temperature)
            pred.capture()
            tg = BatchTalkerGraph(talker.model, tc, batch, dtype=talker.dtype, max_seq_len=self.max_seq_len)
            tg.capture()
            self.graphs[key] = (pred, tg)
        return self.graphs[key]

    @torch.inference_mode()
    def prepare(self, texts, language, prompt, ref_text):
        fast = self.fast
        input_ids = fast.model._tokenize_texts([fast.model._build_assistant_text(t) for t in texts])
        vcp, ref_ids, icl = fast._resolve_voice_clone_prompt(
            input_ids=input_ids, ref_audio=None, ref_text=ref_text, xvec_only=False,
            append_silence=False, voice_clone_prompt=list(prompt) * len(texts) if len(prompt) == 1 else prompt)
        tie, tam, tth, tpe = fast._build_talker_inputs_local(
            m=self.m, input_ids=input_ids, ref_ids=ref_ids, voice_clone_prompt=vcp,
            languages=[language] * len(texts), speakers=None, non_streaming_mode=False,
            instruct_ids=[None] * len(texts))
        ref_codes = vcp["ref_code"][0] if icl else None
        return tie, tam, tth, tpe, ref_codes

    @torch.inference_mode()
    def generate(self, texts, language, prompt, ref_text, budgets, temperature=0.9, top_k=50,
                 repetition_penalty=1.05, min_new_tokens=2):
        """Returns (codes per line, finished-by-end-token flags, timing)."""
        B = len(texts)
        pred, tg = self._graphs(B, temperature)
        tie, tam, tth, tpe, ref_codes = self.prepare(texts, language, prompt, ref_text)
        m = self.m
        talker = m.talker
        config = m.config.talker_config
        eos = config.codec_eos_token_id
        vocab = config.vocab_size
        device = tie.device
        suppress = torch.zeros(vocab, dtype=torch.bool, device=device)
        suppress[max(0, vocab - 1024):] = True
        suppress[eos] = False
        talker.rope_deltas = None
        t0 = time.time()
        out = talker.forward(inputs_embeds=tie, attention_mask=tam, use_cache=True, output_hidden_states=True,
                             return_dict=True, trailing_text_hidden=tth, tts_pad_embed=tpe, generation_step=None,
                             past_hidden=None, past_key_values=None)
        past_hidden = out.past_hidden
        gen_step = out.generation_step
        token = sample_logits(out.logits[:, -1, :], temperature=temperature, top_k=top_k, top_p=1.0, do_sample=True,
                              suppress_mask=suppress, suppress_tokens=[eos])
        prefill_len = tg.prefill_kv(out.past_key_values)
        tg.set_generation_state(tam, getattr(talker, "rope_deltas", None))
        torch.cuda.synchronize()
        t_prefill = time.time() - t0
        codec_embed = talker.get_input_embeddings()
        codec_head = talker.codec_head
        pred_embeds = talker.code_predictor.get_input_embeddings()
        budget = torch.tensor(budgets, device=device)
        finished = torch.zeros(B, dtype=torch.bool, device=device)
        ended = torch.zeros(B, dtype=torch.bool, device=device)
        lengths = torch.zeros(B, dtype=torch.long, device=device)
        seen = torch.zeros(B, vocab, dtype=torch.bool, device=device)
        rows = torch.arange(B, device=device)
        steps = []
        t1 = time.time()
        for step in range(max(budgets)):
            is_end = token == eos
            newly = is_end & ~finished
            ended |= newly
            finished |= is_end
            over = (~finished) & (step >= budget)
            finished |= over
            if bool(finished.all()):
                break
            lengths += (~finished).long()
            last = codec_embed(token.unsqueeze(1))
            cbs = pred.run(torch.cat((past_hidden, last), dim=1))
            steps.append(torch.cat([token.unsqueeze(1), cbs], dim=1))
            hid = [last] + [pred_embeds[i](cbs[:, i:i + 1]) for i in range(config.num_code_groups - 1)]
            emb = torch.cat(hid, dim=1).sum(1, keepdim=True)
            emb = emb + (tth[:, gen_step:gen_step + 1] if gen_step < tth.shape[1] else tpe)
            pos = prefill_len + step
            if pos >= tg.max_seq_len - 1:
                break
            h = tg.run(emb, pos)
            logits = codec_head(h[:, -1, :])
            seen[rows, token] = True
            if repetition_penalty != 1.0:
                logits = torch.where(seen, torch.where(logits > 0, logits / repetition_penalty, logits * repetition_penalty), logits)
            token = sample_logits(logits, temperature=temperature, top_k=top_k, top_p=1.0, do_sample=True, suppress_mask=suppress,
                                  suppress_tokens=[eos] if step + 1 < min_new_tokens else None)
            past_hidden = h[:, -1:, :].clone()
            gen_step += 1
        torch.cuda.synchronize()
        t_decode = time.time() - t1
        codes = torch.stack(steps, dim=1) if steps else torch.zeros(B, 0, 16, dtype=torch.long, device=device)
        per_line = [codes[b, : int(lengths[b])] for b in range(B)]
        return per_line, ended.tolist(), ref_codes, {"prefill_s": t_prefill, "decode_s": t_decode, "steps": len(steps)}

    @torch.inference_mode()
    def decode_audio(self, per_line, ref_codes):
        tok = self.m.speech_tokenizer
        audio = []
        for codes in per_line:
            if codes.shape[0] == 0:
                audio.append(None)
                continue
            full = torch.cat([ref_codes.to(codes.device), codes], dim=0) if ref_codes is not None else codes
            wavs, sr = tok.decode({"audio_codes": full.unsqueeze(0)})
            a = wavs[0]
            a = a.flatten().cpu().numpy() if hasattr(a, "cpu") else a.flatten()
            if ref_codes is not None:
                a = a[int(ref_codes.shape[0] / full.shape[0] * len(a)):]
            audio.append(a)
        return audio, sr
