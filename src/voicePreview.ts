import type { Voice } from "./types";

// Spoken content follows the voice's language, not the interface locale.
// Feature sources: App, AppearancePanel, BindingMenu, TipCard, and Studio's
// CastPanel, ProductionView, WordsPanel and ExportDialog.
export const voicePreviewTips = [
  {
    id: "bookmark-sentence",
    English: "A bookmark in Origami Reader remembers the sentence where you saved it. Open that bookmark later, and the reader returns to that passage, so you can carry on without hunting through the page.",
    French: "Un signet dans Origami Reader mémorise la phrase où vous l'avez placé. Ouvrez ce signet plus tard et le lecteur revient à ce passage, pour reprendre tranquillement sans chercher votre place dans la page.",
  },
  {
    id: "book-voice",
    English: "Your books can share one reading voice, but an individual book can have its own. Look in the book's menu to give a favourite story a narrator that belongs just to that book.",
    French: "Vos livres peuvent partager la même voix, mais un livre peut aussi avoir la sienne. Explorez son menu pour offrir à votre histoire préférée une voix qui lui est réservée, sans changer celle des autres livres.",
  },
  {
    id: "sleep-chapter",
    English: "The sleep timer can stop at the end of the current chapter, instead of after a fixed number of minutes. It is rather useful when you want one more chapter, but your pillow has other plans.",
    French: "La minuterie peut arrêter la lecture à la fin du chapitre en cours, plutôt qu'après un nombre précis de minutes. C'est pratique quand vous voulez encore un chapitre, mais que votre oreiller a d'autres projets.",
  },
  {
    id: "pronunciation-scope",
    English: "If a narrator mispronounces a name, you can save a pronunciation rule for that book or for every book. The written words stay the same, while Origami Reader changes how they are spoken.",
    French: "Si une voix prononce mal un nom, vous pouvez enregistrer une règle pour ce livre ou pour tous vos livres. Les mots écrits restent les mêmes, tandis qu'Origami Reader adapte leur prononciation à voix haute.",
  },
  {
    id: "spoken-version",
    English: "A passage can have a spoken version that differs from the text on the page. Select the passage and explore the spoken text controls when an abbreviation or unusual spelling needs a little help.",
    French: "Un passage peut avoir une version parlée différente du texte affiché. Sélectionnez le passage et explorez les réglages du texte parlé lorsqu'une abréviation ou une orthographe inhabituelle demande un petit coup de main.",
  },
  {
    id: "paper-theme",
    English: "The colour of your reading page is separate from the app's surroundings. You can keep a dark, atmospheric scene around a light page, and turn the paper texture off if you prefer a cleaner surface.",
    French: "La couleur de votre page est indépendante du décor de l'application. Vous pouvez garder une ambiance sombre autour d'une page claire, puis désactiver la texture du papier si vous préférez une surface plus sobre.",
  },
  {
    id: "focus-tools",
    English: "Origami Reader has focus tools for following a line or concentrating on a paragraph. Try the reading strip when a busy page makes it difficult to keep your eyes on the words you want.",
    French: "Origami Reader propose des aides pour suivre une ligne ou se concentrer sur un paragraphe. Essayez la bande de lecture lorsqu'une page chargée vous empêche de garder les yeux sur les mots qui vous intéressent.",
  },
  {
    id: "side-panels",
    English: "You can collapse the navigation panel and the inspector independently. Keep the tools you need, tuck the others away, and give the book a little more room without changing your reading settings.",
    French: "Vous pouvez replier séparément le panneau de navigation et l'inspecteur. Gardez les outils utiles, rangez les autres et laissez un peu plus de place au livre, sans modifier vos réglages de lecture.",
  },
  {
    id: "binding-scope",
    English: "Binding and bookmarks lets you choose page edges, spine finishes, and cover decoration. Apply a look to all your books, or give one particular volume its own treatment, like a special edition on your shelf.",
    French: "Les réglages de reliure et de signets permettent de choisir les tranches, le dos et les ornements de couverture. Appliquez un style à tous vos livres ou personnalisez un seul volume, comme une édition spéciale.",
  },
  {
    id: "bookmark-look",
    English: "Your bookmark can be a simple coloured ribbon or a decorative design. Explore the bookmark appearance options to choose its look, and use a still version when you would rather keep the page surroundings quiet.",
    French: "Votre signet peut être un simple ruban coloré ou un modèle décoratif. Explorez ses options d'apparence pour choisir son style, puis optez pour une version immobile si vous préférez une ambiance plus calme autour du livre.",
  },
  {
    id: "quick-read",
    English: "Quick Read lets you bring a piece of text straight into Origami Reader. It is handy for a passage you copied, a draft you want to hear, or something too small to deserve its own document file.",
    French: "La lecture rapide permet d'ajouter directement un texte dans Origami Reader. C'est pratique pour un passage copié, un brouillon à écouter ou quelques lignes qui ne méritent pas forcément leur propre fichier.",
  },
  {
    id: "model-settings",
    English: "The model settings show which speech models are installed and let you choose the one to use. If you are comparing speed and quality on your computer, this is a useful place to explore.",
    French: "Les réglages des modèles indiquent les modèles vocaux installés et permettent de choisir celui à utiliser. C'est un endroit utile à explorer pour comparer la vitesse et la qualité sur votre ordinateur.",
  },
  {
    id: "voice-creator",
    English: "The voice creator lets you describe a voice and try a generated preview before saving it. A description can mention the accent, texture, age, and delivery you imagine for your next storyteller.",
    French: "Le créateur de voix permet de décrire une voix et d'essayer un aperçu avant de l'enregistrer. Votre description peut préciser l'accent, le timbre, l'âge et la façon de raconter que vous imaginez.",
  },
  {
    id: "voice-favourites",
    English: "The little heart on a voice card saves it as a favourite. Use the favourites filter when your collection grows, so the narrators you enjoy are easier to find than that one character with seventeen names.",
    French: "Le petit cœur d'une fiche vocale ajoute cette voix à vos favoris. Quand votre collection grandit, utilisez le filtre des favoris pour retrouver vos narrateurs préférés plus facilement que ce personnage aux dix-sept noms.",
  },
  {
    id: "read-work",
    English: "Read mode and Work mode serve different purposes, and switching between them keeps your place. You can step away from a chapter to work on your notes, then return to the story when you are ready.",
    French: "Le mode Lecture et le mode Travail ont des usages différents, mais vous gardez votre place en passant de l'un à l'autre. Quittez un chapitre pour travailler sur vos notes, puis revenez à l'histoire quand vous voulez.",
  },
  {
    id: "slash-menu",
    English: "In a Work mode note, type a forward slash on an empty line to open the block menu. Headings, tables, callouts, and charts are waiting there, without a trip through a forest of toolbars.",
    French: "Dans une note du mode Travail, tapez une barre oblique sur une ligne vide pour ouvrir le menu des blocs. Titres, tableaux, encadrés et graphiques vous y attendent, sans traverser une forêt de barres d'outils.",
  },
  {
    id: "note-links",
    English: "Type two opening square brackets in a note to link another note. The destination also records that connection, which makes it easier to follow an idea back to the place where you first used it.",
    French: "Tapez deux crochets ouvrants dans une note pour créer un lien vers une autre note. La destination garde aussi cette connexion, ce qui aide à retrouver l'endroit où vous avez utilisé une idée pour la première fois.",
  },
  {
    id: "note-hover",
    English: "Hover over a link to another note and you can preview it without leaving the page. It is a small shortcut for checking a detail while keeping the sentence you were writing firmly in view.",
    French: "Survolez un lien vers une autre note pour en voir un aperçu sans quitter la page. Ce petit raccourci permet de vérifier un détail tout en gardant sous les yeux la phrase que vous étiez en train d'écrire.",
  },
  {
    id: "pinned-notes",
    English: "Pin the notes you reach for most often in Work mode. They stay near the top of the sidebar, so your current project, reading journal, or increasingly ambitious list of ideas is close at hand.",
    French: "Épinglez les notes que vous utilisez le plus en mode Travail. Elles restent en haut de la barre latérale, pour garder à portée de main votre projet, votre journal de lecture ou votre liste d'idées toujours plus ambitieuse.",
  },
  {
    id: "work-sources",
    English: "A book can become a source for your Work mode workspace. Open its menu and choose the option to use it in Work mode, then bring your reading into the same space as your notes and study materials.",
    French: "Un livre peut devenir une source dans votre espace de travail. Ouvrez son menu et choisissez de l'utiliser en mode Travail, pour réunir vos lectures, vos notes et vos documents d'étude au même endroit.",
  },
  {
    id: "source-quotation",
    English: "Open a book beside a note from the Sources panel, then drag a paragraph into the note. The quotation keeps a link back to its source, which is much kinder to your future self than a mystery copy and paste.",
    French: "Depuis le panneau des sources, ouvrez un livre à côté d'une note et glissez-y un paragraphe. La citation conserve un lien vers sa source, ce qui aidera votre futur vous bien davantage qu'un copier-coller mystérieux.",
  },
  {
    id: "selection-card",
    English: "You can turn selected text into a study card while taking notes or reading. When a passage deserves more than a quick highlight, making a card gives you a way to come back and practise remembering it.",
    French: "Vous pouvez transformer un texte sélectionné en fiche de révision, dans vos notes ou pendant la lecture. Quand un passage mérite plus qu'un simple surlignage, une fiche vous permet d'y revenir pour exercer votre mémoire.",
  },
  {
    id: "inline-card",
    English: "A question and answer separated by two colons can become a study card inside a note. It is a quick way to capture something worth remembering while the thought is still fresh, before another tab steals it.",
    French: "Une question et une réponse séparées par deux signes deux-points peuvent devenir une fiche dans une note. C'est une façon rapide de saisir une information à retenir avant qu'un autre onglet ne vous fasse oublier votre idée.",
  },
  {
    id: "listen-study",
    English: "Study cards have a listening mode that reads them aloud with your Origami voice. You can review by listening as well as looking, which gives your eyes a break without putting your study session away.",
    French: "Les fiches de révision proposent un mode d'écoute qui les lit avec votre voix Origami. Vous pouvez donc réviser en écoutant, et reposer un peu vos yeux sans ranger votre séance d'étude.",
  },
  {
    id: "scheduled-task",
    English: "A checklist item can carry a date and appear on the Schedule page. In Work mode, add an at sign followed by a date in year, month, and day order to connect a task with your calendar view.",
    French: "Une tâche de liste peut porter une date et apparaître dans le planning. En mode Travail, ajoutez une arobase suivie d'une date dans l'ordre année, mois et jour pour relier cette tâche à votre calendrier.",
  },
  {
    id: "table-chart",
    English: "A table in a note can become a chart. Right-click the table and look for the chart option when a collection of numbers would be easier to understand as something you can actually see at a glance.",
    French: "Un tableau dans une note peut devenir un graphique. Faites un clic droit sur le tableau et cherchez cette option lorsque vos nombres seraient plus faciles à comprendre sous une forme visuelle, d'un seul coup d'œil.",
  },
  {
    id: "live-chart",
    English: "Charts connected to a spreadsheet update when you change the numbers in the sheet. You can explore a different budget or compare a new set of results without rebuilding the chart every time an assumption changes.",
    French: "Les graphiques reliés à une feuille de calcul se mettent à jour quand ses nombres changent. Vous pouvez essayer un autre budget ou comparer de nouveaux résultats sans reconstruire le graphique à chaque nouvelle hypothèse.",
  },
  {
    id: "excel-import",
    English: "Work mode can import an Excel workbook, including its tabs, formulas, and styles. If your reading project has grown a spreadsheet of its own, you can bring it into the workspace alongside the notes that explain it.",
    French: "Le mode Travail peut importer un classeur Excel avec ses onglets, ses formules et ses styles. Si votre projet de lecture possède aussi une feuille de calcul, vous pouvez la réunir avec les notes qui l'expliquent.",
  },
  {
    id: "work-export",
    English: "The Work mode export options can save notes as HTML and Markdown, spreadsheets as Excel files, and study cards for Anki. Your carefully organised ideas do not have to stay inside one workspace forever.",
    French: "Les options d'export du mode Travail peuvent enregistrer les notes en HTML et Markdown, les feuilles au format Excel et les fiches pour Anki. Vos idées soigneusement organisées ne sont pas obligées de rester dans un seul espace.",
  },
  {
    id: "work-search",
    English: "Work mode's search can find notes, spreadsheets, books, and actions together. Try it when you remember what you need but cannot remember which corner of the workspace you tucked it into last week.",
    French: "La recherche du mode Travail retrouve des notes, des feuilles de calcul, des livres et des actions. Essayez-la quand vous savez ce qu'il vous faut, mais plus dans quel coin vous l'avez rangé la semaine dernière.",
  },
  {
    id: "link-for-me",
    English: "Link for me can suggest connections between your notes in a batch you review first. You decide which links belong, and the operation can be undone, so exploring connections does not mean surrendering control of your notebook.",
    French: "La fonction de suggestion de liens propose des connexions entre vos notes, à vérifier avant de les appliquer. Vous décidez des liens à garder et pouvez annuler l'opération, pour explorer sans perdre le contrôle de votre carnet.",
  },
  {
    id: "quiet-work-theme",
    English: "Work mode includes quieter, professional themes in its menu. When a dramatic reading atmosphere feels a little too dramatic for a spreadsheet, you can choose a plainer workspace and get back to the task at hand.",
    French: "Le menu du mode Travail propose des thèmes professionnels plus sobres. Quand une ambiance de lecture spectaculaire devient un peu trop intense pour une feuille de calcul, choisissez un décor plus calme pour retrouver votre concentration.",
  },
  {
    id: "studio-cast",
    English: "Studio mode has a cast panel where characters can be assigned different voices. A narrator and a conversation do not have to sound like the same person, and you can review the casting before producing the audio.",
    French: "Le mode Studio possède un panneau de distribution où vous pouvez attribuer différentes voix aux personnages. Le narrateur et les dialogues n'ont pas besoin de sonner pareil, et vous pouvez vérifier vos choix avant de produire l'audio.",
  },
  {
    id: "studio-retake",
    English: "In Studio mode, you can regenerate an individual line instead of starting the whole production again. If one sentence needs another performance, give that line a new take while keeping the rest of your work.",
    French: "En mode Studio, vous pouvez régénérer une seule réplique au lieu de recommencer toute la production. Si une phrase mérite une autre interprétation, offrez-lui une nouvelle prise en conservant le reste de votre travail.",
  },
  {
    id: "studio-words",
    English: "Studio has pronunciation controls for words that recur throughout a production. Set how a name should be spoken there, rather than correcting the same troublesome character's name separately every time they enter the story.",
    French: "Le Studio propose des réglages de prononciation pour les mots qui reviennent dans une production. Définissez-y la façon de dire un nom, plutôt que de corriger ce même personnage chaque fois qu'il entre dans l'histoire.",
  },
  {
    id: "studio-audiobook",
    English: "Studio can export a production as an audiobook with chapters, or as separate audio files for each chapter. Explore the export options when your cast is ready and you want to listen beyond the editing screen.",
    French: "Le Studio peut exporter une production en livre audio avec chapitres, ou en fichiers audio séparés pour chaque chapitre. Explorez ces options quand votre distribution est prête et que vous voulez écouter ailleurs que dans l'éditeur.",
  },
  {
    id: "achievements",
    English: "The Achievements page shows what reading, coming back and trying new parts of Origami Reader will unlock. Themes, finishes, ribbon colours and bookmarks are all earned there, so curiosity is quite literally rewarded.",
    French: "La page Succès montre ce que la lecture, vos retours et la découverte de nouvelles parties d'Origami Reader permettent de débloquer. Thèmes, finitions, couleurs de signet et signets s'y gagnent, la curiosité est donc vraiment récompensée.",
  },
  {
    id: "celebration-places",
    English: "Some places to read are celebrations that open only when you read during their month. Open a book at the right time of year, and a new scene may be waiting for you in the gallery.",
    French: "Certains lieux de lecture sont des fêtes qui ne s'ouvrent que si vous lisez pendant leur mois. Ouvrez un livre au bon moment de l'année, et un nouveau décor vous attendra peut-être dans la galerie.",
  },
  {
    id: "local-time",
    English: "The scene around your book can follow the local time, moving from day to night as the evening comes. Choose this in the appearance settings, or keep the sun and moon button to change it yourself.",
    French: "Le décor autour de votre livre peut suivre l'heure locale et passer du jour à la nuit quand le soir arrive. Choisissez-le dans les réglages d'apparence, ou gardez le bouton Soleil et Lune pour le changer vous-même.",
  },
  {
    id: "follow-narration",
    English: "While a book is read aloud, the page can follow the narration and turn by itself. Look for the option to follow narration when you want to listen with your hands free, perhaps around a cup of tea.",
    French: "Pendant la lecture à voix haute, la page peut suivre la narration et tourner toute seule. Cherchez l'option Suivre la narration si vous voulez écouter les mains libres, autour d'une tasse de thé par exemple.",
  },
  {
    id: "read-from-here",
    English: "Select a passage and choose Read from here to start listening exactly where your eyes are. It is a quick way to hear one paragraph again, or to jump back in after skimming ahead.",
    French: "Sélectionnez un passage et choisissez Lire à partir d'ici pour écouter exactement là où se trouvent vos yeux. C'est une façon rapide de réentendre un paragraphe ou de reprendre après avoir parcouru la suite.",
  },
  {
    id: "pauses",
    English: "In the reading aloud settings, you can lengthen the pauses after sentences, paragraphs and headings. A little more silence can make a dense chapter easier to follow, and the pauses shorten at faster speeds.",
    French: "Dans les réglages de lecture à voix haute, vous pouvez allonger les pauses après les phrases, les paragraphes et les titres. Un peu plus de silence rend un chapitre dense plus facile à suivre, et les pauses raccourcissent aux vitesses rapides.",
  },
  {
    id: "visualizer",
    English: "The little sound visualizer beside the play button has more than one style. Click it to try another, or turn it off in the reading aloud settings if you prefer a calmer player.",
    French: "Le petit visualiseur sonore à côté du bouton de lecture a plusieurs styles. Cliquez dessus pour en essayer un autre, ou désactivez-le dans les réglages de lecture à voix haute si vous préférez un lecteur plus calme.",
  },
  {
    id: "author-facts",
    English: "The Continue reading card can share a fact about the author. Choose Another fact for a new one, a small way to learn something about the writer between two chapters.",
    French: "La carte Continuer la lecture peut partager une anecdote sur l'auteur. Choisissez Une autre anecdote pour en découvrir une nouvelle, une petite façon d'en apprendre davantage entre deux chapitres.",
  },
  {
    id: "typefaces",
    English: "The typeface settings include dyslexia-friendly options such as OpenDyslexic and Atkinson Hyperlegible. Try them if letters tend to swim on the page, and adjust the spacing until the text feels comfortable.",
    French: "Les réglages de police proposent des options adaptées à la dyslexie, comme OpenDyslexic et Atkinson Hyperlegible. Essayez-les si les lettres semblent danser sur la page, puis ajustez l'espacement jusqu'à trouver un texte confortable.",
  },
  {
    id: "vault",
    English: "A vault keeps chosen books and documents out of sight until its PIN is entered. Its contents are encrypted on this computer, which suits a private journal or a surprise you are still planning.",
    French: "Un coffre garde certains livres et documents hors de vue jusqu'à ce que son code PIN soit saisi. Son contenu est chiffré sur cet ordinateur, idéal pour un journal personnel ou une surprise encore en préparation.",
  },
  {
    id: "parental-pin",
    English: "A parental PIN can protect the setting that allows mature cover artwork. Set one in the settings, so younger readers keep standard covers even when they explore every menu.",
    French: "Un code PIN parental peut protéger le réglage qui autorise les couvertures pour adultes. Définissez-en un dans les paramètres pour que les jeunes lecteurs gardent des couvertures classiques, même en explorant tous les menus.",
  },
  {
    id: "generated-cover",
    English: "Any book can get a new cover painted on your computer. Open Change cover, describe the scene you imagine, and the lettering can be chosen automatically from the book's genres.",
    French: "Chaque livre peut recevoir une nouvelle couverture peinte sur votre ordinateur. Ouvrez Changer la couverture, décrivez la scène que vous imaginez, et le lettrage peut être choisi automatiquement selon les genres du livre.",
  },
  {
    id: "saved-artwork",
    English: "Covers and portraits you make can be saved as picture files. Look in Saved artwork, in the settings, to review them, delete the ones you do not need, or open their folder.",
    French: "Les couvertures et portraits que vous créez peuvent être enregistrés comme fichiers image. Ouvrez Illustrations enregistrées, dans les paramètres, pour les revoir, supprimer ceux dont vous n'avez plus besoin ou ouvrir leur dossier.",
  },
  {
    id: "voice-note",
    English: "In a Work mode note, type a slash and choose Voice note to record yourself. Origami Reader can then write down what you said, right on this computer, without sending your voice anywhere.",
    French: "Dans une note du mode Travail, tapez une barre oblique et choisissez Note vocale pour vous enregistrer. Origami Reader peut ensuite écrire ce que vous avez dit, directement sur cet ordinateur, sans envoyer votre voix nulle part.",
  },
  {
    id: "handwriting-photo",
    English: "A photo of handwritten notes can become text. In a Work mode note, type a slash and choose Photo of handwriting, then check the words underlined in orange, the ones it is less sure about.",
    French: "Une photo de notes manuscrites peut devenir du texte. Dans une note du mode Travail, tapez une barre oblique et choisissez Photo d'écriture manuscrite, puis vérifiez les mots soulignés en orange, ceux dont il est moins sûr.",
  },
  {
    id: "related-notes",
    English: "Related notes appear beside the note you are writing, matched by meaning rather than exact words, even across languages. It is a gentle way to rediscover something you wrote months ago and forgot.",
    French: "Les notes liées apparaissent à côté de celle que vous écrivez, rapprochées par le sens plutôt que par les mots exacts, même d'une langue à l'autre. Une façon douce de retrouver une idée écrite il y a des mois puis oubliée.",
  },
  {
    id: "picture-cards",
    English: "Picture cards help you learn diagrams and maps. Drop in an image, drag boxes over the parts to learn, and practise naming each part while it is hidden.",
    French: "Les cartes image aident à apprendre des schémas et des cartes. Déposez une image, tracez des cadres sur les parties à apprendre, puis entraînez-vous à nommer chaque partie pendant qu'elle est cachée.",
  },
  {
    id: "practice-test",
    English: "Your study cards can become a practice test. When a quiz is coming up, start one from Work mode and see what you remember before the real questions arrive.",
    French: "Vos fiches de révision peuvent devenir un test d'entraînement. Quand un examen approche, lancez-en un depuis le mode Travail et voyez ce que vous retenez avant les vraies questions.",
  },
  {
    id: "web-embeds",
    English: "Once you allow online embeds, a note can hold a video, a post or a map from the web. They stay off until you choose, because those services can then see your connection.",
    French: "Une fois les intégrations en ligne autorisées, une note peut accueillir une vidéo, une publication ou une carte du Web. Elles restent désactivées jusqu'à votre choix, car ces services peuvent alors voir votre connexion.",
  },
  {
    id: "plugins",
    English: "Plugins can add commands, panels and tools to Work mode. Each one runs in its own sealed space with no internet access, and sees only what you allow it to see.",
    French: "Les modules peuvent ajouter des commandes, des panneaux et des outils au mode Travail. Chacun fonctionne dans son propre espace isolé, sans accès à Internet, et ne voit que ce que vous l'autorisez à voir.",
  },
  {
    id: "mode-shortcut",
    English: "Press Control, Shift and W to move between Read, Work and Studio. It is the quickest way to jump from a chapter to your notes and back again.",
    French: "Appuyez sur Ctrl, Maj et W pour passer entre Lecture, Travail et Studio. C'est le moyen le plus rapide d'aller d'un chapitre à vos notes, puis d'y revenir.",
  },
  {
    id: "studio-read-along",
    English: "Studio can turn a recording into a read-along ebook, with its own audio and each sentence highlighted as it is spoken. It is a lovely way to share a story with someone learning to read.",
    French: "Le Studio peut transformer un enregistrement en livre numérique à lecture synchronisée, avec son propre audio et chaque phrase surlignée au moment où elle est dite. Une jolie façon de partager une histoire avec quelqu'un qui apprend à lire.",
  },
  {
    id: "studio-stems",
    English: "For sound editing, Studio can export stems, one audio file per speaker for every chapter, already lined up. Bring them into your favourite audio editor to mix the voices yourself.",
    French: "Pour le montage sonore, le Studio peut exporter des pistes séparées, un fichier audio par locuteur pour chaque chapitre, déjà alignées. Ouvrez-les dans votre éditeur audio préféré pour mixer les voix vous-même.",
  },
] as const;

const greetings: Record<string, string> = {
  English: "Hello, I'm {name}.",
  French: "Bonjour, je suis {name}.",
  German: "Hallo, ich bin {name}. Wollen wir ein paar Seiten zusammen lesen?",
  Spanish: "Hola, soy {name}. ¿Leemos unas páginas juntos?",
  Italian: "Ciao, sono {name}. Leggiamo qualche pagina insieme?",
  Portuguese: "Olá, eu sou {name}. Vamos ler algumas páginas juntos?",
  Russian: "Здравствуйте, я {name}. Почитаем вместе несколько страниц?",
  Japanese: "こんにちは、{name}です。一緒に少し読みましょうか。",
  Korean: "안녕하세요, {name}입니다. 함께 몇 페이지 읽어 볼까요?",
  Chinese: "你好，我是{name}。我们一起读几页吧？",
};

// One shuffled deck per spoken language, shared across voices for this session.
// Switching narrators does not reset the deck or repeat the last tip.
export function createPreviewPicker(random: () => number = Math.random) {
  const decks = new Map<string, { remaining: number[]; last: number }>();
  return (voice: Pick<Voice, "name" | "languages">): string => {
    const language = greetings[voice.languages[0]] ? voice.languages[0] : "English";
    const greeting = greetings[language].replace("{name}", () => voice.name);
    if (language !== "English" && language !== "French") return greeting;
    const deck = decks.get(language) ?? { remaining: [], last: -1 };
    if (!deck.remaining.length) {
      deck.remaining = voicePreviewTips.map((_, index) => index);
      for (let i = deck.remaining.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [deck.remaining[i], deck.remaining[j]] = [deck.remaining[j], deck.remaining[i]];
      }
      const end = deck.remaining.length - 1;
      if (deck.remaining[end] === deck.last) {
        [deck.remaining[0], deck.remaining[end]] = [deck.remaining[end], deck.remaining[0]];
      }
    }
    deck.last = deck.remaining.pop()!;
    decks.set(language, deck);
    return `${greeting} ${voicePreviewTips[deck.last][language]}`;
  };
}

export const previewLine = createPreviewPicker();
