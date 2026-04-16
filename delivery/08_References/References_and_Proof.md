# REFERENCE AND PROOF FILE
## Nigeria Music Analytics System (NMAS)
## National Bureau of Statistics Final Delivery

---

## 1. Primary Data Sources

| # | Source | URL | Usage | Type |
|---|--------|-----|-------|------|
| 1 | Chartmetric Developer API | https://api.chartmetric.com | All artist stats, streaming metrics, charts | Primary data |
| 2 | Chartmetric API Docs | https://api.chartmetric.com/apidoc | Endpoint documentation | Documentation |

## 2. Per-Stream Payout Rate Sources

| # | Source | URL | Data Used | Type |
|---|--------|-----|-----------|------|
| 3 | Ditto Music 2026 | https://dittomusic.com/en/blog/how-much-does-spotify-pay-per-stream | Spotify $0.003-0.005/stream | Rate reference |
| 4 | Chartlex 2026 | https://www.chartlex.com/blog/money/how-much-does-spotify-pay-per-stream-2026 | Spotify rate validation | Rate reference |
| 5 | LabelGrid 2026 (YouTube Music) | https://labelgrid.com/blog/royalties/youtube-pay-per-stream/ | YouTube Music $0.0071/stream | Rate reference |
| 6 | LabelGrid 2026 (Apple Music) | https://labelgrid.com/blog/royalties/how-much-does-apple-music-pay-per-stream/ | Apple Music $0.007-0.01/stream | Rate reference |
| 7 | Royalty Exchange 2025 | https://royaltyexchange.com/blog/how-music-streaming-platforms-calculate-payouts-per-stream-2025 | Multi-platform rates | Rate reference |
| 8 | Hootsuite 2025 | https://blog.hootsuite.com/how-much-does-youtube-pay-per-view/ | YouTube $0.003-0.005/view | Rate reference |
| 9 | RouteNote 2025 | https://routenote.com/blog/how-much-music-streaming-services-pay/ | Deezer, Pandora rates | Rate reference |
| 10 | Soundcamps 2026 | https://soundcamps.com/spotify-royalties-calculator/ | Spotify rate calculator | Validation |
| 11 | Spotify Newsroom Jan 2026 | https://newsroom.spotify.com/2026-01-28/2025-music-industry-payouts-whats-next-for-artists/ | $11B 2025 industry payouts | Context |

## 3. Employment & Economic Sources

| # | Source | URL | Data Used | Type |
|---|--------|-----|-----------|------|
| 12 | US ITA Nigeria Commercial Guide 2024 | https://www.trade.gov/country-commercial-guides/nigeria-media-and-entertainment | 300K direct, 1M indirect employment; ₦1.97T GDP | Employment |
| 13 | Vanguard Nigeria (Apr 2024) | https://www.vanguardngr.com/2024/04/nigerias-creative-industry-employs-4-2-million-nigerians/ | 4.2M creative sector employment | Employment |
| 14 | Nairametrics (Dec 2025) | https://nairametrics.com/2025/12/19/nigerias-music-industry-generates-600m-annually-hannatu-musawa/ | $600M annual revenue; ₦58B Spotify royalties 2024; 2.5M jobs by 2030 | Revenue/Employment |
| 15 | Turntable Charts | https://www.turntablecharts.com/news/1299 | 6.2M daily streams; ₦25B→₦58B royalty growth | Market data |
| 16 | ThisDay Live (Jan 2026) | https://www.thisdaylive.com/2026/01/04/from-sound-to-structure-nigerias-arts-industry-finds-its-economic-spine/ | $7.23T creative economy projection | Context |
| 17 | UNESCO Creative Economy Report 2023 | (institutional publication) | 62/38% male/female creative sector split | Demographics |
| 18 | NBS NLFS Q1 2024 | https://www.nigerianstat.gov.ng/pdfuploads/NLFS_Q1_2024_Report.pdf | 92.7M informal employment | Labour context |
| 19 | IFPI Global Music Report 2024 | (institutional publication) | Spotify 31% market share; 63% Nigeria revenue growth | Market structure |
| 20 | WIPO 2025 International Music Trade Study | (institutional publication) | Cross-country chart appearances as export proxy | Methodology |
| 21 | World Bank Nigeria Data | https://data.worldbank.org/indicator/SL.IND.EMPL.ZS?locations=NG | Industry employment (% total) | Context |

## 4. Production & Cost Sources

| # | Source | URL | Data Used | Type |
|---|--------|-----|-----------|------|
| 22 | NigerianInformer 2025 | https://nigerianinformer.com/cost-of-recording-producing-a-song-in-nigeria/ | ₦100K-₦2M production costs; producer fee schedules | Cost data |
| 23 | Afrokonnect 2025 | https://afrokonnect.ng/how-much-does-a-music-video-cost-in-2025/ | Video production costs $5K-$200K | Cost data |
| 24 | Blisshype 2026 | https://www.blisshype.com.ng/2026/02/music-distribution-in-nigeria-take-your.html | Distribution pricing | Cost data |
| 25 | TaGetMedia 2025 | https://www.tagetmedia.com/post/cost-of-music-promotion | ₦100K-₦500K promotion costs | Cost data |
| 26 | MOC Accountants | https://mocaccountants.com/a-comprehensive-guide-to-launching-a-music-production-studio-in-nigeria/ | Studio setup and operating costs | Cost data |

## 5. Additional Market Sources

| # | Source | URL | Data Used | Type |
|---|--------|-----|-----------|------|
| 27 | Statista (Nigeria Music) | https://www.statista.com/outlook/amo/app/music/nigeria | Market forecast (paywalled) | Market data |
| 28 | Trading Economics | https://tradingeconomics.com/nigeria/employment-in-industry-percent-of-total-employment-wb-data.html | Industry employment trends | Context |
| 29 | MyJobMag 2026 | https://www.myjobmag.com/blog/nigeria-job-statistics | Nigeria employment statistics | Context |
| 30 | Afreximbank Creative Industries Report | https://media.afreximbank.com/afrexim/Estimating-Potential-Economic-Contributions-of-Cultural-and-Creative-Industries-in-Africa.pdf | African creative economy estimates | Context |

---

## 6. API Endpoint Reference

### Accessible (26 endpoints used in this delivery):
1. `GET /api/artist/{id}` — Artist metadata
2. `GET /api/artist/{id}/stat/spotify` — Spotify listeners, followers, popularity
3. `GET /api/artist/{id}/stat/youtube_channel` — YouTube subscribers, channel views
4. `GET /api/artist/{id}/stat/youtube_artist` — YouTube daily/monthly views
5. `GET /api/artist/{id}/stat/instagram` — Instagram followers
6. `GET /api/artist/{id}/stat/tiktok` — TikTok followers, likes
7. `GET /api/artist/{id}/stat/twitter` — Twitter/X followers
8. `GET /api/artist/{id}/stat/facebook` — Facebook followers, likes, talks
9. `GET /api/artist/{id}/stat/soundcloud` — Soundcloud followers
10. `GET /api/artist/{id}/stat/deezer` — Deezer fans
11. `GET /api/artist/{id}/stat/wikipedia` — Wikipedia views
12. `GET /api/artist/{id}/stat/bandsintown` — Bandsintown followers
13. `GET /api/artist/{id}/stat/melon` — Melon fans
14. `GET /api/artist/{id}/stat/twitch` — Twitch followers
15. `GET /api/artist/{id}/stat/line` — Line Music likes
16. `GET /api/artist/{id}/where-people-listen` — City-level listener distribution
17. `GET /api/artist/{id}/charts?type=shazam` — Shazam chart appearances
18. `GET /api/artist/{id}/urls` — Platform URLs
19. `GET /api/artist/{id}/tracks` — Track listing
20. `GET /api/artist/{id}/albums` — Album listing
21. `GET /api/track/{id}` — Track metadata
22. `GET /api/track/{id}/charts?type=shazam` — Track Shazam charts
23. `GET /api/charts/spotify` — Spotify country charts
24. `GET /api/charts/shazam` — Shazam country charts
25. `GET /api/charts/deezer` — Deezer country charts
26. `GET /api/search` — Artist/track search

### Denied (to be supplemented by Soundcharts):
- Track-level stats: Spotify streams, YouTube views, Apple Music, Pandora, TikTok
- Charts: Apple Music, iTunes, YouTube, YouTube Music, TikTok
- Other: playlists, fan-metrics, demographics, related artists, city charts, curator, album

---

*All URLs verified as of April 2026. Some institutional publications (UNESCO, IFPI, WIPO) are referenced by title rather than URL.*
