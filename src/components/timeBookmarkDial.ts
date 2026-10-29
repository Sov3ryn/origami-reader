// Original vector dial layers. Kept separate from the artwork so the still
// thumbnail and moving watch share identical numerals and hand geometry.
export function watchDialMarkup(animated: boolean) {
  const numerals = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
  const labels = numerals.map((label, i) => {
    const a = i * Math.PI / 6;
    return `<text x="${512 + Math.sin(a) * 104}" y="${343 - Math.cos(a) * 104}" text-anchor="middle" dominant-baseline="central" font-family="Georgia,serif" font-size="23" fill="#38302a">${label}</text>`;
  }).join("");
  const movement = (seconds: number, ticking = false) => !animated ? "" : ticking
    ? `<animateTransform attributeName="transform" type="rotate" values="${Array.from({length:61},(_,i)=>-i*6).join(';')}" keyTimes="${Array.from({length:61},(_,i)=>i/60).join(';')}" dur="60s" repeatCount="indefinite" calcMode="discrete"/>`
    : `<animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="${seconds}s" repeatCount="indefinite"/>`;
  return labels + `<g transform="translate(512 343)">
    <g transform="rotate(-55)"><g class="time-hour-hand">${movement(43200)}<path d="M0 15 C-9 8 -7 -8 -3 -18 L-4 -47 Q-12 -56 0 -76 Q12 -56 4 -47 L3 -18 C7 -8 9 8 0 15Z" fill="#454747" stroke="#aca79b" stroke-width="1.6"/><path d="M0 -28 L0 -62" stroke="#e6dfcb" stroke-width="1.5"/></g></g>
    <g transform="rotate(60)"><g class="time-minute-hand">${movement(3600)}<path d="M0 19 C-6 7 -5 -7 -2 -20 L-3 -67 Q-9 -77 0 -99 Q9 -77 3 -67 L2 -20 C5 -7 6 7 0 19Z" fill="#454747" stroke="#aca79b" stroke-width="1.5"/><path d="M0 -32 L0 -85" stroke="#e6dfcb" stroke-width="1.3"/></g></g>
    <g transform="rotate(180)"><g class="time-second-hand">${movement(60,true)}<path d="M0 27 L0 -126" stroke="#6a3340" stroke-width="2"/><circle cy="20" r="5" fill="none" stroke="#6a3340" stroke-width="2"/><path d="M0 -133 L-3 -122 L3 -122Z" fill="#6a3340"/></g></g>
    <circle r="7" fill="#a69a80" stroke="#3b3530" stroke-width="2"/><circle r="3" fill="#eee5ce"/>
  </g>`;
}
