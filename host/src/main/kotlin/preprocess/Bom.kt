package preprocess

/**
 * DF-5 (HOST-05): strip exactly one leading UTF-8 BOM (U+FEFF) from ingested content before ANY
 * downstream consumer sees it — kxml2's Reader-path well-formedness parser (`Preprocessor.validate`)
 * has no BOM handling and demotes a BOM-shifted `<?xml ...?>` declaration to an illegal
 * `xml`-prefixed processing instruction (`PI must not start with xml`), even though a leading BOM is
 * valid XML. A U+FEFF at any position other than offset 0 is ordinary document content (zero-width
 * no-break space) and is left untouched.
 */
object Bom {
  fun strip(content: String): String = content.removePrefix("﻿")
}
