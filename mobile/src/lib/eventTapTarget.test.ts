import { classifyEventTap } from "./eventTapTarget";

describe("classifyEventTap", () => {
  it("an http(s) external_link classifies as a link -> in-app browser", () => {
    expect(classifyEventTap({ externalLink: "https://umassdining.com/some-page", pdfLink: "" })).toEqual({
      kind: "link",
      url: "https://umassdining.com/some-page",
    });
  });

  it("prefers the external link over pdf_link when both are present", () => {
    expect(
      classifyEventTap({
        externalLink: "http://umassdining.com/external",
        pdfLink: "https://umassdining.com/sites/default/files/events/poster.jpg",
      }),
    ).toEqual({ kind: "link", url: "http://umassdining.com/external" });
  });

  it("no external_link but a usable pdf_link classifies as in-feed content -> in-app pamphlet screen", () => {
    expect(
      classifyEventTap({ externalLink: "", pdfLink: "https://umassdining.com/sites/default/files/events/poster.jpg" }),
    ).toEqual({ kind: "content", pamphletImage: "https://umassdining.com/sites/default/files/events/poster.jpg" });
  });

  it("both fields empty (missing payload) is a safe no-op", () => {
    expect(classifyEventTap({ externalLink: "", pdfLink: "" })).toEqual({ kind: "none" });
  });

  it("a non-http(s) external_link (malformed) falls through instead of being treated as a link", () => {
    expect(classifyEventTap({ externalLink: "not a url", pdfLink: "" })).toEqual({ kind: "none" });
  });

  it("an unresolvable pdf_link (umassdining's literal-'default'-host bug) is treated as missing, not content", () => {
    expect(classifyEventTap({ externalLink: "", pdfLink: "https://default/sites/default/files/events/poster.jpg" })).toEqual({
      kind: "none",
    });
  });

  it("whitespace-only external_link is treated as missing, not a malformed link", () => {
    expect(
      classifyEventTap({ externalLink: "   ", pdfLink: "https://umassdining.com/sites/default/files/events/poster.jpg" }),
    ).toEqual({ kind: "content", pamphletImage: "https://umassdining.com/sites/default/files/events/poster.jpg" });
  });

  // Despite the field name, live pdf_link data is almost always a poster .jpg (confirmed via
  // curl -- see docs/apk-reverse-engineering.md), which the pamphlet screen renders as an <Image>.
  // An actual .pdf file would render blank there (RN's <Image> can't decode a PDF) with no error --
  // route those to the in-app browser instead, which can.
  it("a pdf_link that's an actual .pdf file classifies as a link (in-app browser), not in-feed content -- <Image> can't render a PDF", () => {
    expect(classifyEventTap({ externalLink: "", pdfLink: "https://umassdining.com/sites/default/files/events/flyer.pdf" })).toEqual({
      kind: "link",
      url: "https://umassdining.com/sites/default/files/events/flyer.pdf",
    });
  });

  it("a pdf_link ending .pdf with a query string still classifies as a link", () => {
    expect(classifyEventTap({ externalLink: "", pdfLink: "https://umassdining.com/sites/default/files/events/flyer.pdf?v=2" })).toEqual({
      kind: "link",
      url: "https://umassdining.com/sites/default/files/events/flyer.pdf?v=2",
    });
  });

  it("a pdf_link ending .pdf with a fragment still classifies as a link", () => {
    expect(classifyEventTap({ externalLink: "", pdfLink: "https://umassdining.com/sites/default/files/events/flyer.pdf#page=2" })).toEqual({
      kind: "link",
      url: "https://umassdining.com/sites/default/files/events/flyer.pdf#page=2",
    });
  });
});
