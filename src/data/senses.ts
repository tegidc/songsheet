export const SENSES = [
  {
    label: "Sight",
    tw: "bg-amber-100 text-amber-800",
    mark: "bg-amber-200",
    words: ["see","look","glow","dark","bright","flash","shimmer","shine","shadow","blur","color","colour","light","haze","glare","flicker","gleam","pale","vivid","dim","sparkle","dazzle","reflect","silhouette","transparent","visible","glint","loom","watch","stare","gaze","peer","glimpse","spy","observe","notice","appear","fade","blaze","beam","ray","shade","tint","hue"],
  },
  {
    label: "Sound",
    tw: "bg-blue-100 text-blue-800",
    mark: "bg-blue-200",
    words: ["hear","ring","echo","hum","whisper","creak","crash","bang","murmur","roar","silence","quiet","loud","hiss","buzz","clatter","thud","snap","rumble","groan","screech","drone","muffled","resonate","vibrate","tick","clang","rustle","howl","shriek","rattle","clap","knock","tap","ping","pop","crack","squeak","chirp","hum","toll","chime"],
  },
  {
    label: "Smell",
    tw: "bg-emerald-100 text-emerald-800",
    mark: "bg-emerald-200",
    words: ["smell","scent","aroma","odor","odour","stale","fresh","musty","damp","sweet","sour","bitter","pungent","fragrance","reek","waft","acrid","smoky","earthy","rotten","perfume","incense","mildew","pine","petrichor","decay","tang","reek","whiff","stench","sniff","inhale","exhale"],
  },
  {
    label: "Taste",
    tw: "bg-rose-100 text-rose-800",
    mark: "bg-rose-200",
    words: ["taste","sweet","bitter","salty","sour","savory","savoury","flavor","flavour","bland","rich","sharp","tangy","metallic","syrup","acid","dry","smooth","thick","thin","watery","chewy","crisp","raw","ripe","burnt","sugar","salt","spice","zest","mellow","tart","chalky","oily","creamy"],
  },
  {
    label: "Touch",
    tw: "bg-purple-100 text-purple-800",
    mark: "bg-purple-200",
    words: ["touch","soft","rough","smooth","warm","cold","hard","sharp","dull","slick","sticky","wet","dry","brittle","tender","pressure","grip","scratch","scrape","brush","stroke","rub","press","pinch","squeeze","grab","texture","surface","coarse","silky","gritty","numb","tingle","sting","prick","abrasive","bristle","fuzzy","velvety","jagged","slippery"],
  },
  {
    label: "Organic",
    tw: "bg-orange-100 text-orange-800",
    mark: "bg-orange-200",
    words: ["breath","breathe","pulse","sweat","blood","heartbeat","heart","bone","skin","muscle","hunger","thirst","nausea","dizzy","ache","pain","tire","exhaust","shiver","tremble","flush","beat","lung","throat","stomach","gut","nerve","body","flesh","vein","artery","blink","swallow","choke","gasp","cough","sigh","yawn","sneeze","cry"],
  },
  {
    label: "Kinesthetic",
    tw: "bg-teal-100 text-teal-800",
    mark: "bg-teal-200",
    words: ["move","walk","run","step","sway","drift","turn","spin","slide","glide","rush","crawl","float","fall","rise","sink","leap","jump","stagger","stumble","lurch","march","pace","wander","stand","sit","kneel","crouch","lean","balance","hover","hang","bend","curl","heavy","light","weightless","weight","gravity","press","lift","drop","carry","drag","haul","momentum","tension","pull","push","stretch","reach","resist"],
  },
  {
    label: "Verbs",
    tw: "bg-violet-100 text-violet-800",
    mark: "bg-violet-200",
    words: ["break","build","burn","catch","change","choose","come","cut","dig","draw","drink","drive","eat","feel","fight","find","fly","forget","give","go","grow","hold","keep","know","leave","let","lose","make","mean","meet","pay","put","read","say","see","sell","send","show","sit","speak","spend","stand","take","teach","tell","think","throw","understand","wear","win","write","allow","become","begin","believe","bring","call","carry","cause","consider","continue","create","decide","describe","develop","die","end","exist","explain","fail","follow","form","happen","help","include","kill","learn","lead","live","mean","move","need","offer","open","play","provide","reach","remain","remember","return","seem","serve","stay","stop","suggest","support","turn","use","wait","want","work"],
  },
];

// Basic suffix stripping for more natural word matching
export const ALL_SENSE_WORDS = new Set(SENSES.flatMap(s => s.words));
