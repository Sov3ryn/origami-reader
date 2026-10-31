# Licença do app Origami Reader

*Tradução da Licença do app Origami Reader. O original está em inglês
(APP-LICENSE.md).*

Copyright (c) 2026 Sov3ryn. Todos os direitos reservados, exceto conforme
indicado abaixo. “Sov3ryn” é o nome sob o qual o desenvolvedor do
Origami Reader publica o app.

Esta licença abrange o app Origami Reader conforme lançado por Sov3ryn: o
instalador, o app e os arquivos de autoria de Sov3ryn que ele instala,
incluindo as vozes Origami. O código-fonte está disponível separadamente sob a
PolyForm Strict License 1.0.0 (consulte LICENSE).

## Você pode

- Instalar e usar o app nos seus próprios dispositivos, gratuitamente, para
  qualquer finalidade, inclusive uso pessoal, educacional e profissional.
- Manter cópias de segurança para seu próprio uso.
- Manter e compartilhar o que você criar com ele. Suas notas, exportações,
  capas geradas e gravações são suas, sujeitas às licenças dos livros, vozes e
  modelos envolvidos e à seção “Conteúdo gerado por IA e vozes”.

## Você não pode

- Compartilhar, publicar, vender, alugar, emprestar ou sublicenciar cópias do
  app ou do seu instalador, no todo ou em parte, inclusive por meio de sites
  de download, pacotes de software ou lojas de aplicativos. Em vez disso,
  indique às pessoas o download oficial.
- Modificar o app, nem remover ou alterar seus avisos de direitos autorais,
  créditos ou telas de licença.
- Descompilar, desmontar ou fazer engenharia reversa do app lançado, exceto na
  medida em que a lei o permita apesar desta cláusula, em que a licença de um
  componente incluído o permita para esse componente, ou em que a GNU LGPL o
  exija para as partes do app que usam bibliotecas LGPL (alterá-las para seu
  próprio uso e fazer engenharia reversa para depurar essas alterações). Em
  vez disso, o código-fonte pode ser lido e auditado sob a
  PolyForm Strict License.
- Contornar as assinaturas de atualização do app, ou qualquer crédito, rótulo
  de IA ou marca d’água que o app adicione ao que ele cria, nem ajudar outra
  pessoa a fazer isso.
- Apresentar o app, ou qualquer cópia ou parte dele, como obra sua, nem usar o
  nome Origami Reader ou o logotipo do tsuru para outro produto.

## Versões de teste

As versões marcadas como beta ou prévia são versões iniciais. Elas podem estar
incompletas, mudar ou perder recursos e conter erros que afetem seus arquivos.
Guarde suas próprias cópias dos livros e exportações que forem importantes
para você. Uma versão beta pode parar de funcionar quando uma versão posterior
a substituir.

## Conteúdo gerado por IA e vozes

O Origami Reader usa modelos de IA no seu computador para ler em voz alta,
projetar vozes, gerar imagens, identificar falantes e transcrever gravações, e
pode usá-los para outras finalidades em versões futuras. O que eles produzem
pode estar errado. O app marca o que exporta como gerado por IA, com um
crédito, metadados ou uma marca d’água.

- Use apenas conteúdo que você tenha o direito de usar. Você é responsável
  pelos livros, documentos e gravações que importar e pelo que criar e
  compartilhar com o app.
- Não use o app para criar uma voz que imite uma pessoa real sem a permissão
  clara dessa pessoa, nem para criar conteúdo que se faça passar por alguém,
  engane, assedie ou difame qualquer pessoa, ou que viole a lei.
- As licenças dos modelos, incluindo suas restrições de uso (por exemplo, as
  restrições da CreativeML OpenRAIL-M e da Stability AI Acceptable Use Policy
  para os modelos de imagem), aplicam-se a você e ao que você cria. Elas fazem
  parte destes termos.
- Mantenha os créditos, rótulos de IA e marcas d’água que o app adiciona em
  tudo o que você compartilhar. Ao publicar qualquer coisa feita com a IA do
  app, informe que foi gerada por IA quando a lei ou a plataforma exigir.

## Obras de terceiros

O app inclui software, modelos, vozes, fontes, retratos de autores e livros
criados por terceiros. Eles mantêm suas próprias licenças, listadas nas
configurações do app e na pasta de licenças instalada. Nada aqui retira de
você os direitos que essas licenças lhe concedem sobre esses componentes,
inclusive o direito de alterar, recompilar e depurar componentes sob a
GNU LGPL ou GPL. O leitor leve (workers/light_tts.py), um programa separado
usado com os modelos de voz Kitten e Kokoro, é software livre sob a
GNU General Public License v3 ou posterior, que permite que você copie, altere
e compartilhe esse programa.

## Privacidade

O Origami Reader funciona no seu computador. Ele não tem conta, anúncios,
análises de uso nem rastreamento. Seus livros, notas, gravações, vozes e
configurações ficam no seu computador, e os modelos de IA também são
executados nele, a menos que você mesmo conecte um serviço online (consulte
“Serviços online que você conecta”).

O app se conecta à internet somente:

- para verificar e baixar atualizações, do GitHub (Sov3ryn/origami-updates),
  quando as atualizações automáticas estão ativadas ou quando você mesmo
  verifica;
- para baixar um modelo, uma voz ou um componente do Studio que você escolher,
  do seu publicador (Hugging Face, GitHub, Stability AI) ou do repositório de
  vozes do Origami;
- quando você abre um link, permite conteúdo incorporado no modo Trabalho ou
  abre a página de apoio;
- para enviar a um serviço online que você mesmo conecta o que você pedir que
  ele processe.

A instalação também baixa os componentes que você escolher dos seus
publicadores, e pacotes Python do PyPI e do PyTorch (e da AMD, em computadores
com placa de vídeo AMD). Esses serviços veem o endereço de rede do seu
computador e o que é baixado, de acordo com suas próprias políticas de
privacidade. Sov3ryn não recebe nada disso, além das contagens de downloads
que o GitHub mostra para cada versão. Se você enviar um comentário ou um
relatório de problema, você escolhe o que ele contém.

Se você fizer uma doação, o Ko-fi e seus provedores de pagamento processam seu
pagamento de acordo com os próprios termos. Sov3ryn recebe o que o Ko-fi
compartilha (como seu nome, e-mail e mensagem) e usa essas informações apenas
para agradecer a você e desbloquear seus itens de agradecimento.

## Serviços online que você conecta

Uma versão do app pode permitir que você conecte um serviço online de sua
escolha, como um provedor de IA para narração, com sua própria conta ou chave.
Se você fizer isso:

- O app envia a esse serviço apenas o que você pedir que ele processe (por
  exemplo, o texto de um livro ou capítulo que você narrar com ele), e
  pergunta antes de fazer isso pela primeira vez. Esse serviço então trata
  esse conteúdo de acordo com os próprios termos e política de privacidade,
  que são uma questão entre você e o serviço.
- Você precisa ter o direito de enviar esse conteúdo, é responsável pela sua
  conta, chave e quaisquer custos, e deve seguir os termos do serviço.
- Sov3ryn não opera, controla nem verifica esses serviços e não é responsável
  pelo que eles fazem com seu conteúdo, pelos resultados deles, pela
  disponibilidade deles nem pelas cobranças deles.
- O que eles produzem também é gerado por IA, e estes termos se aplicam a isso
  como a qualquer outra coisa feita com o app, incluindo os créditos, rótulos
  e marcas d’água que o app adiciona.
- Sua chave fica guardada no seu computador e é enviada apenas ao serviço ao
  qual pertence.

## Comentários

Se você enviar ideias, relatórios de problemas ou outros comentários, Sov3ryn
pode usá-los para melhorar o Origami Reader sem lhe dever nada por eles.

## Nomes e logotipos

“Origami Reader” e o logotipo do tsuru identificam o app de Sov3ryn. Estes
termos não dão nenhum direito de usá-los, exceto para se referir ao app de
forma verdadeira. Os nomes de outras empresas e modelos (como Qwen,
Stability AI, NVIDIA, Mistral AI e Meta) pertencem aos seus proprietários e
não significam que eles endossem o Origami Reader.

## Apoio ao app

As doações são opcionais e não alteram estes termos. Elas não são um pagamento
pelo app, pelos seus modelos ou pelas suas vozes. Qualquer agradecimento por
uma doação se limita a desbloquear de imediato os itens cosméticos (como
temas, lugares e acabamentos) que qualquer pessoa pode obter gratuitamente por
meio das conquistas do app naquele momento. Nada no app está disponível apenas
para doadores, e nenhum recurso depende de uma doação.

As doações são presentes e não são reembolsáveis, exceto quando a lei exigir
ou em caso de erro evidente, como um pagamento em duplicidade. Um pagamento
feito por engano é reembolsado descontadas as taxas de pagamento que não forem
devolvidas a Sov3ryn. Se uma doação for reembolsada ou estornada, o
desbloqueio de agradecimento correspondente pode ser removido.

## Se estes termos forem violados

Sua permissão para usar o app termina se você violar estes termos. Se você
interromper a violação e corrigir a situação em até 32 dias após ser
notificado, a permissão continua. Quando sua permissão terminar, pare de usar
o app e exclua suas cópias dele. O que você criou com o app continua sendo
seu. As seções sobre conteúdo gerado por IA, garantia e responsabilidade, e
lei aplicável continuam em vigor.

## Alterações no app

Sov3ryn pode alterar, adicionar ou remover qualquer parte do app a qualquer
momento, incluindo recursos, modelos, vozes, itens cosméticos (como temas,
lugares, acabamentos, cores da fita e marcadores), conquistas e o que cada
conquista exige ou desbloqueia, por exemplo para corrigir um problema, para
cumprir a lei ou o pedido de um titular de direitos, ou para continuar
desenvolvendo o app. Alguns itens podem estar disponíveis apenas por tempo
limitado. Itens desbloqueados e o progresso das conquistas não têm valor
monetário, não podem ser vendidos nem transferidos, e podem mudar ou ser
removidos como qualquer outra parte do app, inclusive itens desbloqueados com
uma doação.

## Alterações nestes termos

Uma versão posterior do app pode vir com novos termos. O app os mostra e pede
que você concorde com eles antes de continuar a usá-lo. Se você não concordar,
pode parar de usar o app. Os termos com os quais você concordou continuam se
aplicando ao que você fez antes.

## Sem garantia

Na medida em que a lei permitir, o app, seus modelos e suas vozes são
fornecidos no estado em que se encontram e conforme disponíveis, sem qualquer
garantia, expressa ou implícita, incluindo garantias de qualidade, adequação a
uma finalidade específica, precisão dos resultados de IA e não violação de
direitos.

## Limitação de responsabilidade

Na medida em que a lei permitir, Sov3ryn não se responsabiliza por quaisquer
danos diretos, indiretos, incidentais, especiais ou consequenciais, nem por
qualquer perda de dados, arquivos, receita ou fundo de comércio, decorrentes
do app, dos seus downloads, dos serviços online que você conectar por meio
dele ou do que ele produzir, mesmo que tenha sido informado de que eram
possíveis. Quando a responsabilidade não puder ser excluída, ela fica limitada
ao maior valor entre o que você pagou pelo app (nada: doações não são
pagamento pelo app) e 50 dólares canadenses. Isso não limita a
responsabilidade por dolo ou culpa grave, nem por danos corporais ou
morais, quando a lei não permitir essa limitação.

## Direitos do consumidor

Nada aqui limita direitos que você tenha nos termos da legislação de defesa do
consumidor e que não possam ser excluídos.

## Lei aplicável

Estes termos são regidos pelas leis de Quebec e pelas leis federais do Canadá
aplicáveis nessa província. Os tribunais de Quebec no distrito judicial de
Montreal decidem as disputas, a menos que a lei do lugar onde você mora lhe dê
o direito de recorrer aos tribunais do seu próprio local.

## Idiomas

Estes termos são apresentados em cada um dos 20 idiomas do app, e a instalação
os mostra no idioma que você escolher. O texto em inglês é o original. Se uma
tradução divergir dele, prevalece o texto em inglês, exceto quando a lei do
lugar onde você mora der efeito à versão no seu idioma.

## Acordo integral

Estes termos, junto com as licenças a que se referem, constituem o acordo
integral sobre o app. Se alguma parte não puder ser aplicada, o restante
continua valendo. O fato de Sov3ryn não exigir o cumprimento de um termo de
imediato não significa renúncia a ele.
