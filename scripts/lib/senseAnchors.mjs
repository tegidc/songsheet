// The seed definition for scripts/build-senses.mjs.
//
// Each sense is grown from two things: the hand-written list that shipped
// before (always kept, whatever its frequency), and a set of WordNet anchors
// walked outward. An anchor names one specific synset — `"colour#n#1"` is
// sense 1 of the noun, "a visual attribute of things", not the paint or the
// quark property — because picking a word and hoping is how the abstract
// branches get in.
//
// Anchor fields:
//   ref    lemma#pos#senseNumber (1-based, WordNet's own most-common-first order)
//   depth  how far down the tree to walk (default DEFAULT_DEPTH)
//   rank   frequency cap for this anchor only, tighter than the global one
//          where the tree is huge and technical (body parts, rocks)
//   allow  lexicographer files a descendant must sit in to be kept. This is
//          the guard that stops "kinds of sound" from arriving at
//          noun.communication and dragging in every speech act.
//   via    pointer symbols to walk: "~" hyponym (nouns/verbs), "&" similar-to
//          (adjective clusters), "!" antonym (the opposite of a sight
//          adjective is a sight adjective).

export const DEFAULT_DEPTH = 3;
export const DEFAULT_RANK = 35000;

/**
 * The eyeball pass, written down.
 *
 * Everything above is a rule; this is the residue no rule catches, read off
 * the generated lists by hand. Three kinds of thing end up here:
 *
 *   · words WordNet is right about and writing is not — `region`, `member`,
 *     `feature` and `area` really are body parts, `sheer` and `near` really
 *     are verbs of motion, but nobody uses them that way;
 *   · common words whose sensory reading is rare enough that scoring them
 *     would be mostly false positives — `low`, `still`, `small`, `back`,
 *     `must`, `down`, `side`, `pass`;
 *   · specialist vocabulary that slipped the frequency gate because it is
 *     common in some other field — golf (`birdie`, `bunker`, `putt`), textiles
 *     (`tammy`, `terry`, `rep`, `huck`), geology (`magma`).
 *
 * Kept as a list rather than folded into the filters on purpose: each of these
 * is a judgement about one word, and a rule general enough to catch them all
 * would take good words with it.
 */
export const REJECT = new Set([
  // Sight
  "admire","regard","configuration","corona","fireball","curvature","narrowing",
  "liquid","inflamed","infrared","ultraviolet","maize","pied","wine","bleach",
  // Sound
  "angelus","blatant","low","still","gentle","gentleness","chorus","bay",
  // Smell
  "must","funky",
  // Taste
  "down","peck",
  // Touch
  "het","rep","tammy","terry","shagged","jean","sail","screening","network",
  "material","patch","lining","lined","handkerchief","magma","horny","hilly",
  "peaked","thirsty","rainy","nipping","canvas",
  // Organic
  "area","arse","ass","back","behind","blow","bottom","bummer","chamber",
  "fanny","feature","founder","member","middle","penis","region","seat","side",
  "small","spots","torment","vessel","wasting","organ",
  // Kinesthetic
  "accompany","angle","attitude","boomerang","breaker","career","cock","cycle",
  "dense","density","dog","drain","entrance","entering","err","errant","escort",
  "fan","file","flock","ghost","haunt","mill","motor","near","orbit","overhaul",
  "pan","part","pass","plow","progress","range","reciprocate","refer","retire",
  "revisit","round","sheer","shrink","shuttle","shy","speed","surf","surpass",
  "taxi","thread","track","translation","tsunami","wallow","whine","wing","zoom",
  "avert","bound","bumble","caper","chase","coast","cruise","derail","dismount",
  "divert","ease","eddy","follow","jar","lag","parade","proceed","pursue","quail",
  "rack","retrace","ricochet","skirt","slop","snake","stalk","stray","struggle",
  "trace","wind",
  // Physical
  "birdie","bogey","bunker","bore","band","concern","relate","double","triple",
  "fell","log","picket","plane","putt","single","scissor","deposit","chatter",
  "ground","rig","mow","dissect","anchor","fix","tack","suspend",
]);

const SEE = ["noun.attribute", "noun.phenomenon", "noun.shape", "adj.all", "adj.ppl", "verb.perception"];
const ADJ = ["adj.all", "adj.ppl"];

export const SENSE_DEFS = [
  {
    label: "Sight",
    tw: "bg-amber-100 text-amber-800",
    mark: "bg-amber-200",
    seeds: ["see","look","glow","dark","bright","flash","shimmer","shine","shadow","blur","color","colour","light","haze","glare","flicker","gleam","pale","vivid","dim","sparkle","dazzle","reflect","silhouette","transparent","visible","glint","loom","watch","stare","gaze","peer","glimpse","spy","observe","notice","appear","fade","blaze","beam","ray","shade","tint","hue"],
    extraSeeds: ["cloud","sky","star","moon","sun","mist","fog","smoke","steam","dusk","dawn","twilight","sunlight","moonlight","daylight","lamplight","candlelight","firelight","reflection","outline","edge","rim","line","stripe","speck","fleck","blot","stain","mark","blemish","pattern","grain","white","black","grey","gray","blank","blanc","hollow","gap","dome","curve","ridge","groove"],
    anchors: [
      { ref: "colour#n#1", depth: 3, allow: ["noun.attribute"] },          // the colour tree
      { ref: "chromatic_colour#n#1", depth: 3, allow: ["noun.attribute"] },
      { ref: "achromatic_colour#n#1", depth: 3, allow: ["noun.attribute"] },
      { ref: "light#n#1", depth: 2, allow: ["noun.phenomenon", "noun.attribute"] },
      { ref: "brightness#n#1", depth: 2, allow: ["noun.attribute"] },
      { ref: "shape#n#1", depth: 2, allow: ["noun.attribute", "noun.shape"] },
      { ref: "look#v#1", depth: 2, allow: ["verb.perception"] },
      { ref: "shine#v#2", depth: 2, allow: ["verb.weather", "verb.perception"] },
      { ref: "glitter#v#1", depth: 2, allow: ["verb.perception", "verb.weather"] },
      // adjective clusters
      { ref: "bright#a#1",       depth: 2, via: ["&", "!"], allow: ADJ },
      { ref: "coloured#a#1",     depth: 2, via: ["&", "!"], allow: ADJ },
      { ref: "light#a#6",        depth: 2, via: ["&", "!"], allow: ADJ },  // emitting light, not weighing little
      { ref: "transparent#a#1",  depth: 2, via: ["&", "!"], allow: ADJ },
      { ref: "visible#a#1",      depth: 2, via: ["&", "!"], allow: ADJ },
    ],
  },
  {
    label: "Sound",
    tw: "bg-blue-100 text-blue-800",
    mark: "bg-blue-200",
    seeds: ["hear","ring","echo","hum","whisper","creak","crash","bang","murmur","roar","silence","quiet","loud","hiss","buzz","clatter","thud","snap","rumble","groan","screech","drone","muffled","resonate","vibrate","tick","clang","rustle","howl","shriek","rattle","clap","knock","tap","ping","pop","crack","squeak","chirp","toll","chime"],
    extraSeeds: ["noise","song","note","tone","pitch","volume","whistle","sigh","gasp","footstep","voice","hush","din","racket","clink","thump","patter","drip","swish","crackle","whir","gurgle","boom","peal","wail","moan","yell","shout","mutter","mumble","laugh","cough","breath"],
    anchors: [
      { ref: "sound#n#4", depth: 3, allow: ["noun.event"] },                // kinds of noise
      { ref: "noise#n#1", depth: 3, allow: ["noun.event"] },
      { ref: "sound#v#1", depth: 3, allow: ["verb.perception", "verb.contact"] },
      { ref: "hear#v#1",  depth: 2, allow: ["verb.perception"] },
      { ref: "loud#a#1",  depth: 2, via: ["&", "!"], allow: ADJ },
      { ref: "noisy#a#1", depth: 2, via: ["&", "!"], allow: ADJ },
    ],
  },
  {
    label: "Smell",
    tw: "bg-emerald-100 text-emerald-800",
    mark: "bg-emerald-200",
    seeds: ["smell","scent","aroma","odor","odour","stale","fresh","musty","damp","sweet","sour","bitter","pungent","fragrance","reek","waft","acrid","smoky","earthy","rotten","perfume","incense","mildew","pine","petrichor","decay","tang","whiff","stench","sniff","inhale","exhale"],
    extraSeeds: ["mould","mold","rot","fume","vapour","vapor","nostril","breathe","stink","sooty","fusty","rancid","soapy","tarry","resin","sap","dung","sewage","ammonia","antiseptic","bleach","ozone","brackish"],
    anchors: [
      { ref: "smell#n#1", depth: 3, allow: ["noun.attribute"] },
      { ref: "smell#v#1", depth: 3, allow: ["verb.perception"] },
      { ref: "smell#v#2", depth: 3, allow: ["verb.perception"] },
      { ref: "smelling#a#1", depth: 2, via: ["&", "!"], allow: ADJ },
      { ref: "fragrant#a#1", depth: 2, via: ["&", "!"], allow: ADJ },
    ],
  },
  {
    label: "Taste",
    tw: "bg-rose-100 text-rose-800",
    mark: "bg-rose-200",
    seeds: ["taste","sweet","bitter","salty","sour","savory","savoury","flavor","flavour","bland","rich","sharp","tangy","metallic","syrup","acid","dry","smooth","thick","thin","watery","chewy","crisp","raw","ripe","burnt","sugar","salt","spice","zest","mellow","tart","chalky","oily","creamy"],
    extraSeeds: ["tongue","lick","sip","gulp","swig","chew","bite","suck","mouthful","aftertaste","honey","lemon","vinegar","bread","butter","milk","cream","brine","yeast","tinny","rancid","fizzy"],
    anchors: [
      { ref: "taste#n#1", depth: 3, allow: ["noun.attribute"] },
      { ref: "taste_property#n#1", depth: 3, allow: ["noun.attribute"] },
      { ref: "taste#v#1", depth: 2, allow: ["verb.perception"] },
      { ref: "eat#v#1",   depth: 1, allow: ["verb.consumption"] },
      { ref: "drink#v#1", depth: 1, allow: ["verb.consumption"] },
      { ref: "tasty#a#1", depth: 2, via: ["&", "!"], allow: ADJ },
      { ref: "sweet#a#1", depth: 2, via: ["&", "!"], allow: ADJ },
    ],
  },
  {
    label: "Touch",
    tw: "bg-purple-100 text-purple-800",
    mark: "bg-purple-200",
    seeds: ["touch","feel","soft","rough","smooth","warm","cold","hard","sharp","dull","slick","sticky","wet","dry","brittle","tender","pressure","grip","scratch","scrape","brush","stroke","rub","press","pinch","squeeze","grab","texture","surface","coarse","silky","gritty","numb","tingle","sting","prick","abrasive","bristle","fuzzy","velvety","jagged","slippery"],
    extraSeeds: ["cool","hot","chill","heat","freeze","frost","ice","burn","damp","dusty","greasy","waxy","furry","woolly","prickly","clammy","tacky","glassy","polished","flat","flatness","solid","stone","rock","granite","marble","slate","wood","metal","glass","cloth","silk","velvet","wool","linen","leather","paper","sand","mud","clay","dust","grit","bevel","balm","cotton","denim","corduroy","tweed","gauze","lace","satin","burlap","rubber","plastic","tin","steel","iron","brass","copper","concrete","brick","tile","plaster","varnish","wax","foam","straw","bark","fur","feather","husk","rind","seam","edge","rust","chalk","water","ash","dirt","soot","splinter","crumb","enamel","lacquer"],
    anchors: [
      { ref: "texture#n#1", depth: 3, allow: ["noun.attribute"] },
      { ref: "temperature#n#1", depth: 2, allow: ["noun.attribute"] },
      { ref: "touch#v#1", depth: 2, allow: ["verb.perception"] },  // feeling it, not doing things to it
      { ref: "rock#n#2", depth: 2, rank: 20000, allow: ["noun.substance", "noun.object"] },
      { ref: "rough#a#1",  depth: 2, via: ["&", "!"], allow: ADJ },
      { ref: "smooth#a#1", depth: 2, via: ["&", "!"], allow: ADJ },
      { ref: "soft#a#1",   depth: 2, via: ["&", "!"], allow: ADJ },
      { ref: "hard#a#3",   depth: 2, via: ["&", "!"], allow: ADJ },  // resisting pressure, not difficult
      { ref: "hot#a#1",    depth: 2, via: ["&", "!"], allow: ADJ },
      { ref: "wet#a#1",    depth: 2, via: ["&", "!"], allow: ADJ },
      { ref: "sharp#a#2",  depth: 2, via: ["&", "!"], allow: ADJ },
    ],
  },
  {
    label: "Organic",
    tw: "bg-orange-100 text-orange-800",
    mark: "bg-orange-200",
    seeds: ["breath","breathe","pulse","sweat","blood","heartbeat","heart","bone","skin","muscle","hunger","thirst","nausea","dizzy","ache","pain","tire","exhaust","shiver","tremble","flush","beat","lung","throat","stomach","gut","nerve","body","flesh","vein","artery","blink","swallow","choke","gasp","cough","sigh","yawn","sneeze","cry"],
    extraSeeds: ["hand","arm","forearm","wrist","elbow","shoulder","knee","spine","rib","jaw","tooth","teeth","tongue","eyelid","fingertip","knuckle","palm","chest","belly","hip","thigh","shin","ankle","heel","sole","scalp","temple","cheek","brow","tear","spit","saliva","itch","cramp","clench","wince","flinch","shudder","faint","weary","tired","queasy","feverish","numbness","pang","throb","heave","retch","hiccup","snore","yelp","thumb","hair","nail","eyelash","eyebrow","beard","stubble","wrinkle","bruise","blister","callus","scab","freckle","pore","sinew","marrow","tendon","gristle"],
    anchors: [
      { ref: "body_part#n#1", depth: 3, rank: 8000, allow: ["noun.body"] },
      { ref: "somesthesia#n#1", depth: 3, allow: ["noun.cognition", "noun.feeling", "noun.state"] },
      { ref: "pain#n#1", depth: 2, allow: ["noun.cognition", "noun.state", "noun.feeling"] },
      { ref: "breathe#v#1", depth: 3, allow: ["verb.body"] },
      { ref: "symptom#n#1", depth: 2, rank: 10000, allow: ["noun.state"] },
    ],
  },
  {
    label: "Kinesthetic",
    tw: "bg-teal-100 text-teal-800",
    mark: "bg-teal-200",
    seeds: ["move","walk","run","step","sway","drift","turn","spin","slide","glide","rush","crawl","float","fall","rise","sink","leap","jump","stagger","stumble","lurch","march","pace","wander","stand","sit","kneel","crouch","lean","balance","hover","hang","bend","curl","heavy","light","weightless","weight","gravity","press","lift","drop","carry","drag","haul","momentum","tension","pull","push","stretch","reach","resist"],
    extraSeeds: ["tilt","totter","teeter","perch","settle","slump","sprawl","recline","rest","tumble","roll","swing","tremor","jolt","judder","shift","steady","unsteady","upright","stiff","limp","slack","taut","loose","heaviness","lightness","poise","stance","posture","gesture","weigh","raise","lower","hoist","brace","prop","cradle"],
    anchors: [
      { ref: "travel#v#1", depth: 2, allow: ["verb.motion"] },
      { ref: "walk#v#1", depth: 2, allow: ["verb.motion"] },
      { ref: "move#v#3", depth: 2, allow: ["verb.motion"] },
      { ref: "motion#n#2", depth: 1, rank: 20000, allow: ["noun.event", "noun.attribute"] },  // movement, not a proposal
      { ref: "weight#n#1", depth: 2, allow: ["noun.attribute"] },
      { ref: "posture#n#1", depth: 2, allow: ["noun.act", "noun.attribute", "noun.state"] },
      { ref: "heavy#a#1", depth: 2, via: ["&", "!"], allow: ADJ },
      { ref: "steady#a#2", depth: 2, via: ["&", "!"], allow: ADJ },
      { ref: "tight#a#2", depth: 2, via: ["&", "!"], allow: ADJ },
    ],
  },
  {
    // Replaces the old "Verbs" list, which was the ~100 commonest English
    // verbs and so counted `become`/`seem`/`exist` as sensory writing. What is
    // left here is the hands-on half: verbs you can only do to an object.
    label: "Physical",
    tw: "bg-violet-100 text-violet-800",
    mark: "bg-violet-200",
    seeds: ["break","burn","cut","dig","fold","hold","pour","throw","tear","twist","wipe","crush","scrape","pinch","wring","knead","carve","chip","split","snap","bind","tie","knot","stack","pile","sweep","scrub","polish","dent","crack","peel","strip","stitch","weave","nail","hammer","saw","dip","soak","rinse","wash","fill","empty","open","close","shut","lock","unlock"],
    extraSeeds: ["grind","scour","smear","spread","daub","brush","plug","wedge","prop","clamp","hook","latch","fasten","loosen","tighten","unscrew","screw","bolt","glue","paste","pin","staple","trim","clip","slice","chop","shred","mash","squash","flatten","crumple","crease","tuck","wrap","unwrap","bury","scoop","shovel","sift","strain","pump","stir","whisk","beat","toss","fling","hurl","shove","nudge","prod","poke","tap","rap","knock","strike","hit","slap","punch","kick"],
    anchors: [
      { ref: "touch#v#4", depth: 3, allow: ["verb.contact"] },
      { ref: "hit#v#1", depth: 2, allow: ["verb.contact"] },
      { ref: "cut#v#1", depth: 2, allow: ["verb.contact"] },
      { ref: "press#v#3", depth: 2, allow: ["verb.contact"] },
      { ref: "fasten#v#1", depth: 2, allow: ["verb.contact"] },
      { ref: "wash#v#2", depth: 2, allow: ["verb.contact", "verb.change"] },
      { ref: "break#v#4", depth: 2, allow: ["verb.change", "verb.contact"] },
    ],
  },
];

// Abstract verbs — not a sense, a flag. These are what was left of the old
// "Verbs" list once the physical half moved out: the verbs of thinking,
// saying, having and being, which say nothing about the object in front of
// you. Counted and reported, never highlighted, never scored.
export const ABSTRACT_VERB_SEEDS = [
  "allow","appear","apply","argue","arrive","ask","assume","attempt",
  "avoid","beat","become","begin","believe","belong","bring","build",
  "buy","call","carry","cause","change","choose","claim","come","compare",
  "complete","concern","confirm","connect","consider","consist","contain",
  "continue","create","deal","decide","depend","describe","deserve",
  "determine","develop","die","discover","discuss","divide","do","drink",
  "earn","eat","encourage","end","enjoy","ensure","enter","establish",
  "examine","exchange","exist","expand","expect","explain","express",
  "extend","face","fail","feel","fight","find","fix","follow","forget",
  "gain","get","give","go","grow","guess","happen","hate","have","help",
  "identify","imagine","improve","include","indicate","inform","intend",
  "introduce","involve","judge","justify","keep","kill","know","laugh",
  "lead","learn","leave","lend","let","live","look","lose","make",
  "manage","mark","mean","meet","mention","miss","move","need","notice",
  "obtain","occur","pass","pay","perform","permit","persuade","possess",
  "prefer","prepare","prevent","produce","propose","protect","prove",
  "provide","publish","put","raise","reach","read","realise","realize",
  "reckon","recognise","recognize","recommend","reduce","refer","reflect",
  "refuse","regard","reject","relate","rely","remain","remember","remove",
  "repeat","replace","reply","represent","require","respond","return",
  "reveal","satisfy","save","say","secure","see","seek","seem","select",
  "sell","send","separate","serve","settle","show","solve","sound",
  "speak","spend","start","stay","stop","strike","succeed","suffer",
  "suggest","supply","support","suppose","survive","take","teach","tell",
  "tend","thank","think","travel","try","turn","understand","use","vary",
  "visit","vote","wait","want","warn","watch","wear","weigh","welcome",
  "win","wish","wonder","worry","write",

];
