export const OBJECT_WORDS = [
  "candle","kettle","brick","mirror","needle","rope","lantern","button",
  "bottle","feather","ribbon","blade","comb","thimble","latch","hinge",
  "cobweb","ember","pebble","thorn","splinter","rust","bark","moss",
  "ash","chalk","thread","wire","coin","nail","hook","staple","clasp",
  "stamp","lens","wick","flint","wax","spool","latch","wedge","peg",
  "shingle","tile","plank","slate","mortar","beam","rafter","post",
  "knob","hinge","bolt","rivet","clasp","buckle","brooch","bead",
  "acorn","cone","seed","husk","shell","hull","pod","stem","root",
  "twig","bough","bark","sap","resin","pollen","spore","lichen",
  "fog","frost","dew","hail","sleet","gust","draught","soot","smoke",
  "wool","linen","tweed","felt","velvet","burlap","gauze","lace",
  "drum","string","reed","fret","bow","bell","chime","mallet","pick",
  "ladle","tong","whisk","grater","pestle","cleaver","skillet","mug",
  "drawer","shelf","rung","sill","ledge","lintel","eave","gutter",
  "stamp","ticket","receipt","envelope","label","tag","seal","wax",
];

export const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "by","from","as","is","was","are","were","be","been","being","have","has",
  "had","do","does","did","will","would","could","should","may","might",
  "not","it","its","this","that","these","those","i","you","he","she","we",
  "they","me","him","her","us","them","my","your","his","our","their",
  "what","which","who","when","where","how","if","then","there","here",
  "just","some","any","all","no","up","out","more","also","so","than",
  "into","about","over","after","before","very","too","can","now","get",
  "got","go","went","come","came","one","two","three","time","like","know",
]);
export const FN_WORDS = new Set(["a","an","the","and","or","but","in","on","at","to","for","of","with","by","from","as","is","was","are","it","i","my","your","her","his","our","their","me","him","us","them","be","do","not","so","if","up","out","no"]);
export const SECTION_IGNORE_WORDS = new Set([
  "verse","chorus","bridge","intro","outro","hook","section","pre",
  "song","music","lyric","lyrics","chord","chords","note","notes",
  "beginning","middle","object","writing","production","notebook",
]);
