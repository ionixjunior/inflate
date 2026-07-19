package render

import org.kxml2.io.KXmlParser
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader

/**
 * P1-B AC4 (T41): flags `app:`/`res-auto` attributes a previewed layout uses that the **bundled**
 * androidx/Material version does not define.
 *
 * layoutlib silently ignores an unknown application-namespace attribute at inflation (it never errors
 * on it), so a layout written against a newer Material than the pinned bundle would render with those
 * attributes quietly dropped and no signal to the user. This check parses the ORIGINAL content
 * (before preprocessing strips `tools:`), collects every attribute in the
 * `http://schemas.android.com/apk/res-auto` namespace, and returns the distinct names the resolver
 * cannot resolve to a defined `attr` resource — the caller warns, naming each attribute + the bundled
 * Material version.
 *
 * Framework (`android:`) attributes are out of scope (they track the pinned platform, not Material);
 * `tools:` attributes are design-time only. Only res-auto attributes are checked.
 */
object MaterialAttrCheck {

  private const val RES_AUTO_NS = "http://schemas.android.com/apk/res-auto"

  /**
   * Return the distinct res-auto attribute local-names in [content] for which [isDefined] is false
   * (i.e. not defined by the project or any bundled library), in first-seen order. Malformed XML
   * yields an empty list — the render path reports syntax errors separately.
   */
  fun unknownAttrs(content: String, isDefined: (String) -> Boolean): List<String> {
    val seen = LinkedHashSet<String>()
    val unknown = LinkedHashSet<String>()
    try {
      val parser = KXmlParser().apply {
        setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
        setInput(StringReader(content))
      }
      var event = parser.eventType
      while (event != XmlPullParser.END_DOCUMENT) {
        if (event == XmlPullParser.START_TAG) {
          for (i in 0 until parser.attributeCount) {
            if (parser.getAttributeNamespace(i) != RES_AUTO_NS) continue
            val name = parser.getAttributeName(i)
            if (seen.add(name) && !isDefined(name)) unknown += name
          }
        }
        event = parser.next()
      }
    } catch (e: Exception) {
      return emptyList()
    }
    return unknown.toList()
  }
}
