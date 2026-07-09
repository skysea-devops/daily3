// ─── Article RSS source map (v2 — test sonuçlarına göre düzeltildi) ──────────
// Değişiklikler:
//   DÜZELTİLDİ : HBR → feeds.harvardbusiness.org, VoxEU → cepr.org/rss/vox-content (resmi adres)
//   ÇIKARILDI  : McKinsey (10+ yıl durgun), Ensia (2 yıl durgun), Apricitas (durgun),
//                Nir And Far (9 ay durgun), First Round (404), Brookings (bot engeli),
//                Nature News (bot engeli), Harvard Health (404), The Fashion Law (HTML),
//                Greater Good (public RSS yok), School of Life (404)
//   EKLENDİ    : Aşağıda [YENİ] işaretli kaynaklar. [VERIFY] olanları script ile doğrula.

export const RSS_SOURCES: Record<string, { name: string; url: string }[]> = {

  "Software & DevOps": [
    { name: "Stack Overflow Blog",     url: "https://stackoverflow.blog/feed/" },
    { name: "Martin Fowler",           url: "https://martinfowler.com/feed.atom" },
    { name: "InfoQ",                   url: "https://www.infoq.com/feed/" },
    { name: "The New Stack",           url: "https://thenewstack.io/feed/" },
    { name: "AWS Architecture",        url: "https://aws.amazon.com/blogs/architecture/feed/" },
    { name: "ACM Queue",               url: "https://queue.acm.org/rss/feeds/queuecontent.xml" },
    { name: "The Pragmatic Engineer",  url: "https://blog.pragmaticengineer.com/rss/" },
    { name: "Cloudflare Blog",         url: "https://blog.cloudflare.com/rss/" },
  ],

  "Technology": [
    { name: "MIT Technology Review",   url: "https://www.technologyreview.com/feed/" },
    { name: "IEEE Spectrum",           url: "https://spectrum.ieee.org/feeds/feed.rss" },
    { name: "Ars Technica",            url: "https://feeds.arstechnica.com/arstechnica/index" },
    { name: "Eurozine",                url: "https://www.eurozine.com/feed/" },
    { name: "Works in Progress",       url: "https://worksinprogress.co/rss.xml" },
    { name: "Rest of World",           url: "https://restofworld.org/feed/" },
    { name: "Wired",                   url: "https://www.wired.com/feed/rss" },
    { name: "404 Media",               url: "https://www.404media.co/rss/" },
  ],

  "World Politics": [
    { name: "Foreign Affairs",         url: "https://www.foreignaffairs.com/rss.xml" },
    { name: "War on the Rocks",        url: "https://warontherocks.com/feed/" },
    { name: "Atlantic Council",        url: "https://www.atlanticcouncil.org/feed/" },
    { name: "Le Monde Diplomatique",   url: "https://mondediplo.com/spip.php?page=backend" },
    { name: "The Diplomat",            url: "https://thediplomat.com/feed/" },
    { name: "Foreign Policy",          url: "https://foreignpolicy.com/feed/" },
    { name: "Responsible Statecraft",  url: "https://responsiblestatecraft.org/feed/" },
    { name: "Just Security",           url: "https://www.justsecurity.org/feed/" }, // [YENİ] Brookings yerine
  ],

  "Business": [
    { name: "MIT Sloan Review",        url: "https://sloanreview.mit.edu/feed/" },
    { name: "Noema Magazine",          url: "https://www.noemamag.com/feed/" },
    { name: "Knowledge at Wharton",    url: "https://knowledge.wharton.upenn.edu/feed/" },
    { name: "Longreads",               url: "https://longreads.com/feed/" },
    { name: "Fast Company",            url: "https://www.fastcompany.com/latest/rss" },
    { name: "Stratechery",             url: "https://stratechery.com/feed/" }, // [YENİ] Ben Thompson — teknoloji/iş stratejisi analizi, haftalık ücretsiz makale feed'e düşüyor
    { name: "Not Boring",              url: "https://www.notboring.co/feed" }, // [YENİ] Packy McCormick — şirket ve strateji denemeleri (Substack)
    { name: "Commoncog",               url: "https://commoncog.com/rss/" }, // [YENİ][VERIFY] Cedric Chin — iş uzmanlığı ve karar verme üzerine uzun-form
  ],

  "Economics": [
    { name: "Econlib",                 url: "https://www.econlib.org/feed/" },
    { name: "Noahpinion",              url: "https://www.noahpinion.blog/feed" },
    { name: "Works in Progress",       url: "https://worksinprogress.co/rss.xml" },
    { name: "Conversable Economist",   url: "https://conversableeconomist.com/feed/" },
    { name: "Marginal Revolution",     url: "https://marginalrevolution.com/feed" },
    { name: "Project Syndicate",       url: "https://www.project-syndicate.org/rss" },
    { name: "VoxEU (CEPR)",            url: "https://cepr.org/rss/vox-content" }, // [DÜZELTİLDİ] resmi adres
  ],

  "Science": [
    { name: "Quanta Magazine",         url: "https://api.quantamagazine.org/feed/" },
    { name: "Nautilus",                url: "https://nautil.us/feed/" },
    { name: "Undark",                  url: "https://undark.org/feed/" },
    { name: "Aeon",                    url: "https://aeon.co/feed.rss" },
    { name: "Knowable Magazine",       url: "https://knowablemagazine.org/rss" },
    { name: "Ars Technica Science",    url: "https://feeds.arstechnica.com/arstechnica/science" },
    { name: "Scientific American",     url: "http://rss.sciam.com/ScientificAmerican-Global" },
    { name: "Smithsonian (Science)",   url: "https://www.smithsonianmag.com/rss/science-nature/" }, // [YENİ] Nature yerine
  ],

  "Productivity": [
    { name: "Farnam Street",           url: "https://fs.blog/feed/" },
    { name: "Ness Labs",               url: "https://nesslabs.com/feed" },
    { name: "Psyche (Aeon)",           url: "https://psyche.co/feed" },
    { name: "LessWrong",               url: "https://www.lesswrong.com/feed.xml" },
    { name: "Longreads",               url: "https://longreads.com/feed/" },
    { name: "Cal Newport",             url: "https://calnewport.com/feed/" },
    { name: "Scott H. Young",          url: "https://www.scotthyoung.com/blog/feed/" },
    { name: "Raptitude",               url: "https://www.raptitude.com/feed/" }, // [YENİ] Nir And Far yerine
  ],

  "History": [
    { name: "Aeon",                    url: "https://aeon.co/feed.rss" },
    { name: "History Today",           url: "https://www.historytoday.com/feed/rss.xml" },
    { name: "JSTOR Daily",             url: "https://daily.jstor.org/feed/" },
    { name: "Lapham's Quarterly",      url: "https://www.laphamsquarterly.org/rss.xml" },
    { name: "The Public Domain Review", url: "https://publicdomainreview.org/rss.xml" },
    { name: "Eurozine",                url: "https://www.eurozine.com/feed/" },
    { name: "Engelsberg Ideas",        url: "https://engelsbergideas.com/feed/" },
    { name: "Smithsonian (History)",   url: "https://www.smithsonianmag.com/rss/history/" },
  ],

  "Arts & Culture": [
    { name: "Literary Hub (Arts)",     url: "https://lithub.com/category/newsandculture/art-and-photography/feed/" },
    { name: "Aeon",                    url: "https://aeon.co/feed.rss" },
    { name: "Smithsonian Magazine",    url: "https://www.smithsonianmag.com/rss/latest_articles/" },
    { name: "Public Books",            url: "https://www.publicbooks.org/feed/" },
    { name: "JSTOR Daily",             url: "https://daily.jstor.org/feed/" },
    { name: "Eurozine",                url: "https://www.eurozine.com/feed/" },
    { name: "Longreads",               url: "https://longreads.com/feed/" },
    { name: "Hyperallergic",           url: "https://hyperallergic.com/feed/" },
  ],

  "Military": [
    { name: "War on the Rocks",        url: "https://warontherocks.com/feed/" },
    { name: "Modern War Institute",    url: "https://mwi.westpoint.edu/feed/" },
    { name: "Inkstick Media",          url: "https://inkstickmedia.com/feed/" },
    { name: "Atlantic Council",        url: "https://www.atlanticcouncil.org/feed/" },
    { name: "Defense One",             url: "https://www.defenseone.com/rss/all/" },
    { name: "Breaking Defense",        url: "https://breakingdefense.com/feed/" },
    { name: "The War Zone",            url: "https://www.twz.com/feed" },
  ],

  "Health": [
    { name: "Stat News",               url: "https://www.statnews.com/feed/" },
    { name: "Psyche (Aeon)",           url: "https://psyche.co/feed" },
    { name: "Knowable Magazine",       url: "https://knowablemagazine.org/rss" },
    { name: "KFF Health News",         url: "https://kffhealthnews.org/feed/" },
    { name: "NPR Health (Shots)",      url: "https://feeds.npr.org/1128/rss.xml" },
    { name: "MedPage Today",           url: "https://www.medpagetoday.com/rss/headlines.xml" },
    { name: "The Conversation (Health)", url: "https://theconversation.com/us/health/articles.atom" }, // [YENİ][VERIFY]
  ],

  "Environment": [
    { name: "Yale Environment 360",    url: "https://e360.yale.edu/feed.xml" },
    { name: "Carbon Brief",            url: "https://www.carbonbrief.org/feed/" },
    { name: "Grist",                   url: "https://grist.org/feed/" },
    { name: "Anthropocene Magazine",   url: "https://www.anthropocenemagazine.org/feed/" },
    { name: "Inside Climate News",     url: "https://insideclimatenews.org/feed/" },
    { name: "Mongabay",                url: "https://news.mongabay.com/feed/" },
    { name: "bioGraphic",              url: "https://www.biographic.com/feed/" },
    { name: "Atmos",                   url: "https://atmos.earth/feed/" }, // [YENİ][VERIFY] Ensia yerine
  ],

  "Philosophy & Ethics": [
    { name: "Aeon",                    url: "https://aeon.co/feed.rss" },
    { name: "Psyche (Aeon)",           url: "https://psyche.co/feed" },
    { name: "Philosophy Now",          url: "https://philosophynow.org/rss" },
    { name: "The Conversation (Phil)", url: "https://theconversation.com/us/articles.atom" },
    { name: "Daily Nous",              url: "https://dailynous.com/feed/" },
    { name: "Practical Ethics (Oxford)", url: "http://blog.practicalethics.ox.ac.uk/feed/" },
    { name: "The Point Magazine",      url: "https://thepointmag.com/feed/" },
    { name: "3 Quarks Daily",          url: "https://3quarksdaily.com/feed" },
  ],

  "Fashion & Style": [
    { name: "Business of Fashion",     url: "https://www.businessoffashion.com/feed/" }, // endüstri analizi (kısmen paywall)
    { name: "Glossy",                  url: "https://www.glossy.co/feed/" }, // moda/güzellik iş analizi
    { name: "Dazed (Fashion)",         url: "https://www.dazeddigital.com/rss" }, // kültür + moda denemeleri
    { name: "Vestoj",                  url: "https://vestoj.com/feed/" }, // [YENİ][VERIFY] akademik moda eleştirisi — seyrek ama çok kaliteli
    { name: "Blackbird Spyplane",      url: "https://www.blackbirdspyplane.com/feed" }, // [YENİ] Substack, stil üzerine denemeler
    { name: "Put This On",             url: "https://putthison.com/feed/" }, // [YENİ][VERIFY] stil ve zanaat yazıları
  ],

  "Life & Relationships": [
    { name: "Psyche (Aeon)",           url: "https://psyche.co/feed" },
    { name: "Aeon",                    url: "https://aeon.co/feed.rss" },
    { name: "Ness Labs",               url: "https://nesslabs.com/feed" },
    { name: "The Marginalian",         url: "https://www.themarginalian.org/feed/" },
    { name: "The Gottman Institute",   url: "https://www.gottman.com/blog/feed/" },
    { name: "Behavioral Scientist",    url: "https://behavioralscientist.org/feed/" },
    { name: "Tiny Buddha",             url: "https://tinybuddha.com/feed/" }, // [YENİ] Greater Good yerine
   
  ],
};
