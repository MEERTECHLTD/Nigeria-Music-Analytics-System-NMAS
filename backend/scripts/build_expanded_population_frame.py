"""Build the expanded Artist Population Frame for NBS.

Sources merged:
  1. NMAS sample (131 artists) — Artist_Master_List.csv
  2. Earlier curated additions (175)
  3. Chartmetric NG artists (nigerian_artists_chartmetric.json)
  4. Wikipedia: List of Nigerian musicians
  5. Wikipedia: Category pages (musicians, singers, rappers, pop singers,
     male singers, women singers, Afrobeats, gospel, highlife, reggae,
     record producers)
  6. Wikipedia: List of Nigerian gospel musicians
  7. TurnTable Charts (homepage + chart news)
  8. MCSN aggregate member count (38,054) — recorded as Summary-sheet ceiling,
     NOT added as rows (no names are publicly available)

Outputs:
  delivery/04_Datasets/Artist_Population_Frame.csv     (flat)
  delivery/03_Excel_Deliveries/8_Artist_Population_Frame.xlsx  (Summary + sheets)
"""

from __future__ import annotations

import csv
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[2]
SAMPLE_CSV = ROOT / "delivery" / "04_Datasets" / "Artist_Master_List.csv"
NG_CM_JSON = ROOT / "delivery" / "11_Raw_Extractions" / "nigerian_artists_chartmetric.json"
OUT_CSV = ROOT / "delivery" / "04_Datasets" / "Artist_Population_Frame.csv"
OUT_XLSX = ROOT / "delivery" / "03_Excel_Deliveries" / "8_Artist_Population_Frame.xlsx"

MCSN_AGGREGATE_COUNT = 38054  # MCSN homepage: "38,054+ Members"
MCSN_SONGS_TRACKED = 450000   # MCSN homepage: "450K+ Songs Tracked"

# ---------------------------------------------------------------------------
# Wikipedia / scraped source lists. Each (name, source, category).
# Names preserved as extracted — normalisation happens later.
# ---------------------------------------------------------------------------

WIKI_MAIN_LIST = [
    "2Baba", "9ice", "A-Q", "Abiodun Koya", "Ada Ehi", "Adé Bantu", "Adekunle Gold",
    "Adesua Etomi-Wellington", "Adewale Ayuba", "Ado Gwanja", "Afrikan Boy",
    "Afro Candy", "Alamu Atatalo", "Ali Nuhu", "Ali Jita", "Amarachi", "Andre Blaze",
    "AQT", "Aramide", "Ara", "Asake", "Asuquomo", "Aṣa", "Ayinde Bakare",
    "Ayinla Kollington", "Ayinla Omowura", "Ayola", "Ayo Maff", "Ayra Starr",
    "Babatunde Olatunji", "Babyboy AV", "Bella Shmurda", "Banky W", "Blackface Naija",
    "Blackmagic", "Blaqbonez", "Bnxn", "Boy Spyce", "Brymo", "Burna Boy",
    "Bongos Ikwue", "CDQ", "Celestine Ukwu", "Chella", "Chidinma", "Chike",
    "Christy Essien-Igbokwe", "Chinko Ekun", "Chinyere Udoma", "Charly Boy", "CKay",
    "Cobhams Asuquo", "Cynthia Morgan", "D'banj", "Daddy Showkey", "Da Emperor",
    "Da Grin", "Dammy Krane", "Darey", "Dauda Epo-Akara", "Davido", "Dekumzy",
    "Dele Ojo", "Dice Ailes", "Di'Ja", "Don Jazzy", "DOTTi The Deity", "D'Prince",
    "Dr Sir Warrior", "Dr. Alban", "Dr SID", "Duncan Mighty", "Ebenezer Obey",
    "Ebuka Songs", "Echezonachukwu Nduka", "Eddy Wata", "Eedris Abdulkareem",
    "Ego Ogbaro", "Ehis D'Greatest", "eLDee", "Emeka Nwokedi", "Emma Nyra",
    "Emmy Gee", "Erigga", "Eva Alordiah", "Evi Edna Ogholi", "Mike Falana", "Falz",
    "Famous Pluto", "Faze", "Fela Kuti", "Fela Sowande", "Femi Kuti", "Fireboy DML",
    "Flavour N'abania", "Frank Edwards", "Genevieve Nnaji", "GoodGirl LA",
    "Greatman Takit", "Helen Parker-Jayne Isibor", "Harrysong", "Haruna Ishola",
    "Humblesmith", "I.K. Dairo", "Ice Prince", "Ifé", "Idahams", "Iyanya",
    "Ikechukwu", "J. Martins", "Jamopyper", "Jaywon", "Jesse Jagz", "Jasën Blu",
    "Joeboy", "Joe El", "Johnny Drille", "John Okafor", "Justina Lee Brown",
    "K1 De Ultimate", "Kcee", "Kefee", "Khaid", "Kida Kudz", "King Perryy",
    "King Wadada", "Kizz Daniel", "Koker", "Korede Bello", "Kheengz", "Ladipoe",
    "Lagbaja", "Lara George", "Laycon", "Lil Kesh", "Lyta", "Llona", "M.I",
    "M Trill", "Made Kuti", "Majek Fashek", "May7ven", "May D", "Mayorkun",
    "Maud Meyer", "Mercy Chinwo", "Mike Ejeagha", "Mo'Cheddah", "Mode 9",
    "Monica Ogah", "Mr 2Kay", "Mr Eazi", "Mr Raw", "Mr Real", "Muma Gee", "Muna",
    "Naeto C", "Naira Marley", "Neon Adejo", "Niniola", "Niyola", "Nkem Owoh",
    "Nneka", "Nonso Amadi", "Nonso Bassey", "Nosa", "Obongjayar", "Obesere",
    "Obiwon", "Odumodublvck", "Olamide", "Oliver De Coque", "Oluwa Toyo",
    "Omawumi", "Omah Lay", "Joseph Omotoye", "Omotola Jalade Ekeinde",
    "Onyeka Onwenu", "Orezi", "Oriental Brothers", "Oritse Femi", "Orits Williki",
    "Orlando Julius", "Oshara", "Osita Osadebe", "Orlando Owoh", "Oxlade",
    "Muraina Oyelami", "P-Square", "Patience Ozokwor", "Patoranking",
    "Paul Play Dairo", "Pepenazi", "Pericoma Okoye", "Peruzzi", "Peter King",
    "Phyno", "Pheelz", "Praiz", "Prettyboy D-O", "Prince Nico Mbarga", "PsychoYp",
    "Pasuma", "Qdot", "Ras Kimono", "Reekado Banks", "Rema", "Reminisce",
    "Rex Lawson", "Ric Hassani", "Ruby Gyang", "Ruger", "Ruggedman", "Runtown",
    "Remi Aluko", "Sade Adu", "Safin De Coque", "Saheed Osupa", "Salawa Abeni",
    "Samsong", "Sarz", "Sasha P", "Sean Tizzle", "Seun Kuti", "Seyi Shay",
    "Seyi Vibez", "Slimcase", "Shallipopi", "Shekx", "Shina Peters", "Simi",
    "Sinach", "Skales", "Shola Allynson", "Small Doctor", "Somadina",
    "Sonny Okosuns", "Sound Sultan", "Spyro", "Stella Damasus", "St. Seií",
    "Sunny Ade", "Sunmisola Agbebi", "T-Plux", "Tamara Jones", "Tekno Miles",
    "Tems", "Teni", "Terry G", "The Cavemen", "Timaya", "Tiwa Savage",
    "Timi Dakolo", "Toby Foyeh", "Tomi Favored", "Tonto Dikeh", "Tony Allen",
    "Tony Tetuila", "Tonye Garrick", "Tope Alabi", "Tunde King", "Tunde Nightingale",
    "Tunji Oyelana", "TY Bello", "Victor Olaiya", "Victor Uwaifo", "Victony",
    "Vudumane", "Waconzy", "Waje", "Wasiu Alabi Pasuma", "Wasiu Ayinde Barrister",
    "Weird MC", "William Onyeabor", "Wizkid", "Wurld", "Yarden", "Ycee",
    "Yemi Alade", "Yinka Ayefele", "Yinka Davies", "Young Jonn", "Yung6ix",
    "Yusuf Olatunji", "Zerrydl", "Zlatan", "Zayn Africa", "Zinoleesky", "Zoro",
    "Zule Zoo",
]

WIKI_CATEGORY_MISC = [
    "Abibu Oluwa", "Abiodun", "AcebergTM", "Tomi Agape", "Aminu Ala", "Gaise Baba",
    "Adé Bantu", "Jasën Blu", "Wizard Chan", "Comfort Omoge", "Timi Dakolo",
    "Dandizzy", "Eso Dike", "Kolade Dominate", "Dr Roy", "Mr Dutch", "Tunde Ednut",
    "Agbonayinma Ehiozuwa", "Ken Erics", "Fave", "GoodGirl LA", "Chris Delvan Gwamna",
    "Tosin Igho", "Bongos Ikwue", "Nura M Inuwa", "Suté Iwar", "Testimony Jaga",
    "Tunde Jegede", "Kabaka", "Kida Kudz", "Killertunes", "Omah Lay", "Magníto",
    "Tolü Makay", "Bala Miller", "Morocco Maduka", "Echezonachukwu Nduka",
    "Nneka", "Ejyk Nwamba", "Christy Ogbah", "Hubert Ogunde", "Okiemute",
    "Fidelis Uchenna Okoro", "Okechukwu Oku", "Patience Ozokwor", "Poco Lee",
    "POS", "Prettyboy D-O", "PsychoYP", "Sexy Steel", "TY Shaban", "Olly Sholotan",
    "Barbara Soky", "Soundz", "Spyro", "Billar Stoner", "Teemeeysax", "Teezee",
    "Tolex", "OC Ukeje", "Vudumane", "Wavy the Creator", "Wolfacejoeyy",
    "Akanbi Wright", "Yhemolee", "Zhus Jdo",
]

WIKI_MALE_SINGERS = [
    "Odunlade Adekola", "Tope Adenibuyan", "Julius Agwu", "Alpha P", "Asuquomo",
    "Ayo Maff", "Ayola", "Lilin Baba", "Nonso Bassey", "Bayanni", "Joseph Benjamin",
    "Burna Boy", "Chike", "Paul Play Dairo", "Carter Efe", "Twyse Ereme",
    "Famous Pluto", "Ado Gwanja", "OJB Jezreel", "Khaid", "Krexx Nv", "Omah Lay",
    "Llona", "Magixx", "Yakubu Muhammed", "Obesere", "Blessing Offor", "Oluwa Toyo",
    "Ikechukwu", "Oshara", "Rema", "TY Shaban", "Babyboy AV", "Boy Spyce",
    "Yhemolee", "Adam A. Zango", "Zerrydl", "Zhus Jdo",
]

WIKI_WOMEN_SINGERS = [
    "Chigul", "Uche Elendu", "Jennifer Eliogu", "Lara George", "Shan George",
    "Marvy", "May7ven", "Monicazation", "Bukunmi Oluwasina", "Seun Omojola",
    "Cossy Orjiakor", "Helen Paul", "Princess Peters", "Saffron", "Simi",
    "Barbara Soky", "Nelly Uchendu", "Becky Umeh",
]

WIKI_SINGERS = [
    "Fisayo Ajisola", "Segun Arinze", "Ayo Maff", "Azanti", "Tonto Dikeh",
    "Mr Dutch", "Famous Pluto", "Fior de Bior", "Toby Foyeh",
    "Cornelius Adam Igbudu", "Made Kuti", "Marvy", "Ninety", "Sonny Okosun",
    "Ivie Okujaye", "Pawzz", "Saffron", "Zerrydl",
]

WIKI_RAPPERS = [
    "Tope Adenibuyan", "GMK", "Laycon", "Ikechukwu", "Cruel Santino", "Shaybo",
    "JJC Skillz", "MCskill ThaPreacha",
]

WIKI_POP = [
    "AcebergTM", "Charly Boy", "D'banj", "Dencia", "Michael Ekeghasi",
    "Tobi Ibitoye", "Lord of Ajasa", "Majeeed", "Makayla Malaka", "Ifi Ude", "Wani",
]

WIKI_AFROBEATS = [
    "2Baba", "Yemi Alade", "Alpha P", "Nonso Amadi", "Asake", "Ayo Maff",
    "Zinoleesky", "DJ Bally", "Ossy Brown", "CKay", "Johnny Crown", "D'banj",
    "Kizz Daniel", "Darkoo", "Mr Eazi", "Carter Efe", "Ehis D'Greatest", "ELDee",
    "Famous Pluto", "Fireboy DML", "EdoMan", "Don Jazzy", "Barry Jhay",
    "Kendickson", "Lekaa Beats", "Limoblaze", "Qing Madi", "Marenikae",
    "Naira Marley", "May7ven", "Mayorkun", "Goya Menor", "Morravey",
    "James Chike Nwankwo", "Nissi", "Snazzy the Optimist", "Oxlade", "Rema",
    "Sarz", "Tiwa Savage", "Shallipopi", "Boy Spyce", "Ayra Starr", "Tekno",
    "Tempoe", "Tems", "Tony Tetuila", "Töme", "Wizkid", "Zerrydl",
]

WIKI_GOSPEL = [
    "Adedoyin Oseni", "Sunmisola Agbebi", "Hurlarstringz", "Oluwatobi Oyero",
    "Theophilus Sunday", "TeeMirror", "Tomi Folayan", "Ayo Vincent",
    "Ada Ehi", "Bidemi Olaoba", "Bola Are", "Chigozie Wisdom", "Chinyere Udoma",
    "Chioma Jesus", "Cobhams Asuquo", "Cornelius Adam Igbudu", "Dunni Olanrewaju",
    "Ebuka Songs", "Eben", "el Mafrex", "Emmanuel Iren", "Folabi Nuel",
    "Frank Edwards", "Funmi Aragbaye", "Gaise Baba", "Greatman Takit", "Jahdiel",
    "Jeremiah Gyang", "Joe Praize", "Joseph Adebayo Adelakun",
    "Joshua Mike-Bamiloye", "Judikay", "Kefee", "Kunle Ajayi", "Lara George",
    "Limoblaze", "Mairo Ese", "Mega 99", "Mercy Chinwo", "Mike Abdul",
    "Minister GUC", "Moses Bliss", "Mr M & Revelation", "Nathaniel Bassey",
    "Neon Adejo", "Nikki Laoye", "Nimix", "Nosa", "Obiwon", "Onos Ariyo",
    "Onyeka Onwenu", "Osinachi Nwachukwu", "Ossy Brown", "Patty Obasi", "Samsong",
    "Sammie Okposo", "Sinach", "Snatcha", "Sola Allyson", "Sunmisola Agbebi",
    "Tim Godfrey", "Tomi Favored", "Tope Alabi", "TY Bello", "Victor Thompson",
    "Victoria Orenze",
]

WIKI_HIGHLIFE = [
    "Ajebo Hustlers", "Chris Ajilo", "Bantu", "Christy Essien-Igbokwe", "Kabaka",
    "Rex Lawson", "Israel Njemanze", "Ejyk Nwamba", "Monica Ogah", "Christy Ogbah",
    "Babá Ken Okulolo", "Victor Olaiya", "Peacocks Guitar Band International",
    "The Cavemen", "Ugezu J. Ugezu", "Umu Obiligbo", "Victor Uwaifo",
]

WIKI_REGGAE = [
    "2Baba", "Dr. Alban", "Blackface Naija", "Majek Fashek", "Faze", "General Pype",
    "Ras Kimono", "Duncan Mighty", "Evi Edna Ogholi", "Sonny Okosun", "Orezi",
    "Orits Williki", "Patoranking", "Timaya",
]

WIKI_PRODUCERS = [
    "Mike Abdul", "Bola Abimbola", "Lindsey Abudei", "Olugbenga Adelekan", "Ajofé",
    "Laolu Akins", "Cobhams Asuquo", "DJ Bally", "Bello Sisqo", "Maleek Berry",
    "DJ Big N", "Blaisebeatz", "Bloody Civilian", "DJ Caise", "Chopstix", "CKay",
    "DJ Coublon", "DJ Cuppy", "Dareysteel", "Davido", "Oliver De Coque", "Dekumzy",
    "DJ AB", "Douyé", "Dr Roy", "Frank Edwards", "Efe Mac Roc",
    "Odunsi the Engine", "Fiokee", "GMK", "Happi", "Lemmy Jackson", "Jesse Jagz",
    "JaySynths", "OJB Jezreel", "DJ Kaywise", "KDDO", "Kel-P", "Killertunes",
    "Femi Leye", "London", "Louddaaa", "Masterkraft", "Prince Nico Mbarga",
    "Nicole Moudaber", "Mr. P", "DJ Neptune", "Niphkeys", "Tolu Obanro", "Obesere",
    "Kenny Ogungbe", "Wole Oni", "P2J", "Phantom", "Rudeboy", "Rymzo",
    "Sess the Prblm Kid", "Agboola Shadare", "Shanga", "DJ Shawn", "Shugavybz",
    "JJC Skillz", "Spellz", "Spinall", "Supernovamusician", "Tekno", "Tkeyz",
    "Dapo Torimiro", "DJ Tunez", "Andre Vibez", "Patrice Wilson", "WizzyPro",
    "Wolfacejoeyy", "Superstar YB", "Zayn Africa", "Zeeno Foster",
]

TURNTABLE_ARTISTS = [
    # turntablecharts.com/charts/1 (Nigeria Top 100) — filtered to NG-based artists
    "Asake", "Wizkid", "Omah Lay", "Kidd Carder", "Mavo",
    "Johnny Drille", "Young Jonn", "Ayra Starr", "Adekunle Gold", "Olamide",
    "Seyi Vibez", "Joeboy", "Wizard Chan", "Modola", "Bhadboi OML",
    "The Second Voice", "Starsamm", "Udeh Divine Ifunanya", "6UFF", "ODUMODUBLVCK",
    "Fitzy West", "Murz", "Kemena", "Aisosa",
    "$tretto", "Beezy X", "Chella", "ELMAH", "Shoday", "FOLA",
    "Lekaa Beats", "ARTSALGHUL", "SSSoundGawd", "Boy Spyce", "Falz",
    "Boy Muller", "Chech", "Zlatan", "Evado", "CKay", "Deobi", "Boi Chase",
    "Rybeena", "Fido", "Bloody Civilian", "LADIPOE", "EmmaOMG", "Iyanya",
    "Wande Coal", "Qing Madi", "TUFF KING", "Candy Bleakz", "Ndotz",
    "Al Xapo", "Benzoo", "EeQue", "Phyno", "Flavour", "Ema Onigah",
    "T.I BLAZE", "Bella Kay", "Burna Boy", "Syemca", "Chike", "Tml Vibez",
    "Ruger", "Amma", "Ayjay bobo", "Monochrome", "NO11",
]

# kworb.net Nigeria Spotify daily chart — NG-based artists only (non-NG filtered).
KWORB_SPOTIFY_NG = [
    "Kidd Carder", "Mavo", "BNXN", "Sarz", "Asake", "Wizkid", "OMAH LAY",
    "Joeboy", "Wizard Chan", "Abefe", "CKay", "Johnny Drille", "Ayra Starr",
    "Young Jonn", "FOLA", "Davido", "Shoday", "Zlatan", "Al Xapo", "Rema",
    "Tems", "Boy Muller", "Chech", "Seyi Vibez", "ODUMODUBLVCK", "Amma",
    "Lekaa Beats", "Daecolm", "NO11", "Ayjay bobo", "Monochrome", "Kizz Daniel",
    "Shallipopi", "Burna Boy", "Phyno", "Flavour", "T.I BLAZE", "Fave", "Fido",
    "Evado", "Kunmie", "Monaky", "Zaylevelten", "KayArchonn", "where.t.at",
    "Benzoo", "EeQue", "Victony", "Zinoleesky", "Lyta", "2Baba", "Bella Shmurda",
    "Cruel Santino", "Muyeez", "Zerrydl", "Ayo Maff", "Famous Pluto", "Runtown",
    "Fireboy DML", "Adekunle Gold", "BabyDaiz", "Kvng Vinci", "Plutomania",
    "SPINALL", "DETO BLACK", "SAMAD", "Oberz", "EmmaOMG", "JNR ELDER", "TUFF KING",
    "Hotkeed", "Vibez Inc", "Tkeyz", "SteveHills", "The Second Voice", "Rybeena",
    "BhadBoi OML", "Terry Apala", "BBO", "Chike", "Ecool", "Morravey", "Iphxne Dj",
    "Qing Madi", "Ruger", "Olamide", "Ndotz",
]

# Hausa / Northern Nigerian artists — compiled from multiple sources:
# Wikipedia Hausa music, Last.fm hausa tag, kashgain.net top Hausa,
# nigerianleaders.com top Hausa, mdundo.com top Hausa, Kannywood Wikipedia.
# Plus explicit names the user requested.
HAUSA_NORTHERN = [
    # Already in curated list but re-listed here for source attribution
    "Ali Jita", "Nazifi Asnanic", "Adam A. Zango", "Classiq", "Morell",
    "Rarara", "Abdul D One", "Hamisu Breaker", "DJ AB", "Ceeboi",
    "Ado Gwanja", "Nura M Inuwa", "Lilin Baba", "Yakubu Muhammed",
    "Kheengz", "TY Shaban",
    # New Hausa additions from this round of sources
    "Namenj", "Umar M Shareef", "Naziru M Ahmad", "Naziru Sarkin Waka",
    "Dauda Kahutu Rarara", "Garzali Miko", "Khalifa SK Dorai",
    "Shehu Ahmad Tajal Izzy", "OG Abbah", "FirstKlaz", "B.O.C Madaki",
    "Dan Maraya Jos", "Dan Maraya", "Mamman Shata", "Audo Yaron Goje",
    "Ibrahim Na Habu", "Ibrahim Narambada", "Barmani Choge",
    "Sadi Sidi Sharifai", "Aminu Ala", "Aminu Alan Waka", "Salim Smart",
    "Fati Niger", "Auta Mg Boy", "Hauwa Yarfulani", "Maryam Booth",
    "Mosbeekhan", "Zaki Dan Yaya", "Abubakar Sani", "Malam Mamman Barkah",
    # User-requested explicit names
    "DJ AB 442", "Hotman", "Hotman Fire", "Dan Musa",
    # Other widely-known Hausa artists not yet captured
    "Hotyce", "Deezell", "Sadiq Zazzabi", "Maryam Yahaya", "Momee Gombe",
    "Dahiru Mai Lafiya", "Rahama Sadau",
]

# Boomplay-prominent NG artists. We were blocked from scraping Boomplay
# directly (fetcher refused both www.boomplay.com and boomplay.com), so
# this list is the minimal manual subset of NG artists known to chart
# prominently on Boomplay per Chartmetric's public HMC write-ups. Most
# will already dedupe against existing entries; a few may be new.
BOOMPLAY_NG = [
    "Rema", "Burna Boy", "Davido", "Wizkid", "Asake", "Fireboy DML",
    "Olamide", "Phyno", "Flavour", "Kcee", "Timaya", "Patoranking",
    "Qdot", "Small Doctor", "Mohbad", "Portable", "Ruger", "Kizz Daniel",
    "Ayra Starr", "Victony", "Odumodublvck", "Seyi Vibez", "Shallipopi",
    "Skales", "Tekno", "CKay",
]

# kworb.net Nigeria Apple Music chart — NG-based only (non-NG filtered via EXCLUDE)
KWORB_APPLE_NG = [
    "2Baba", "6uff", "Adekunle Gold", "Amma", "Ayra Starr", "Ayjay bobo",
    "Bella Shmurda", "Bhadboy OML", "Blaqbonez", "BNXN", "Boy Muller",
    "Burna Boy", "Chech", "Ciza", "CKay", "Cruel Santino", "Davido", "Daecolm",
    "Ecool", "Elmah", "Falz", "Famous Pluto", "Fireboy DML", "FOLA",
    "Iphxne Dj", "Joeboy", "Johnny Drille", "Jumabee", "Kfmd", "Kibilou",
    "Kidd Carder", "Kizz Daniel", "Lekaa Beats", "Lincoln", "Mavo", "Mayorkun",
    "Modola", "Monochrome", "Morravey", "Muyeez", "Ndotz", "NO11",
    "Odumodublvck", "Olamide", "Omah Lay", "Oxlade", "Qing Madi", "Rema",
    "Ruger", "S1ordie", "Sarz", "Seyi Vibez", "Shaiboy", "Shallipopi",
    "Specikinging", "Spinall", "Straffitti", "Tems", "The Second Voice",
    "Tml Vibez", "Victony", "Wizkid", "Young Jonn", "Zaylevelten", "Zeldan",
    "Zinoleesky", "Zlatan",
]

# Wikipedia: List of number-one songs in Nigeria (2023, 2024, 2025, 2026)
WIKI_NO1_SONGS_NG = [
    # 2023
    "Asake", "Ruger", "Ayra Starr", "BNXN", "Kizz Daniel", "Seyi Vibez",
    "Adekunle Gold", "Zinoleesky", "Davido", "Olamide", "Rema", "KCee",
    "Omah Lay", "Mohbad", "Odumodublvck", "Bloody Civilian", "Shallipopi",
    # 2024
    "Chike", "Titom", "Yuppe", "Burna Boy", "S.N.E", "Brown Joel", "BoyPee",
    "Hyce", "Wizkid", "Smur Lee", "Muyeez", "Vibez Inc",
    # 2025
    "Kunmie", "Fido", "Chella", "Young Jonn", "CKay", "Famous Pluto", "Zerrydl",
    "Mavo",
    # 2026
    "Shoday", "FOLA",
]

# Wikipedia: Category:Yoruba-language Nigerian singers (115+ names)
WIKI_YORUBA_LANG = [
    "Salawa Abeni", "Bola Abimbola", "King Sunny Adé", "Prince Adekunle",
    "Joseph Adebayo Adelakun", "Gabriel Afolayan", "Dice Ailes", "Tope Alabi",
    "Yemi Alade", "Batile Alake", "Shola Allyson", "Terry Apala",
    "Funmi Aragbaye", "Aramide", "Bola Are", "Aṣa", "Asake", "Yinka Ayefele",
    "Ayeloyun", "Ayinde Bakare", "Reekado Banks", "Banky W.", "Ayinde Barrister",
    "Beautiful Nubia", "Shaffy Bello", "TY Bello", "King Steve Benjamin",
    "Bobby Benson", "T.I Blaze", "Brymo", "Segun Bucknor", "Chidinma",
    "Wande Coal", "D'banj", "I. K. Dairo", "Timi Dakolo", "Darey",
    "Davido", "Yinka Davies", "DOTTi The Deity", "Abiodun Duro-Ladipo",
    "Chinko Ekun", "ELDee", "Da Emperor", "Christy Essien-Igbokwe",
    "Dizzy K Falola", "Oritse Femi", "Fireboy DML", "Lara George",
    "Adekunle Gold", "IllRymz", "Haruna Ishola", "Jamopyper", "Jaywon",
    "Don Jazzy", "K1 De Ultimate", "Jesse King", "Tunde King", "Kokoro",
    "Ayinla Kollington", "Fela Kuti", "L.A.X", "Lagbaja", "Nikki Laoye",
    "Laycon", "Lijadu Sisters", "Lil Kesh", "LKT", "Lojay", "Lord of Ajasa",
    "Lyta", "Naira Marley", "May D", "Mayorkun", "Mega 99", "Tunde Nightingale",
    "Niniola", "Niyola", "Obesere", "Ebenezer Obey", "Serifatu Oladunni Oduguwa",
    "Hubert Ogunde", "Kola Ogunkoya", "Dele Ojo", "Moses Olaiya", "Victor Olaiya",
    "Olamide", "Dunni Olanrewaju", "Olu Maintain", "Taye Olusola",
    "Ayinla Omowura", "Saheed Osupa", "Orlando Owoh", "Tunji Oyelana",
    "Wasiu Alabi Pasuma", "Pepenazi", "Shina Peters", "Lola Rae",
    "Josiah Ransome-Kuti", "Reminisce", "Fatai Rolling Dollar", "Tiwa Savage",
    "Agboola Shadare", "Shaydee", "Shoday", "Dr Sid", "Simi", "Skales",
    "Small Doctor", "Seyi Sodimu", "Ayra Starr", "Styl-Plus", "Sunkanmi",
    "T-Classic", "Femi Temowo", "Tjan", "Twins Affair", "Seyi Vibez",
    "Wizkid", "Ycee", "Zlatan",
]

# Wikipedia: Category:Igbo-language singers
WIKI_IGBO_LANG = [
    "Charly Boy", "Bright Chimezie", "CKay", "Oliver De Coque",
    "Christy Essien-Igbokwe", "Flavour", "Duncan Mighty", "Nneka",
    "Monica Ogah", "Theresa Onuorah", "Onyeka Onwenu",
    "Chief Stephen Osita Osadebe", "P-Square", "Dr Sir Warrior",
]

# Wikipedia: Category:Nigerian DJs
WIKI_DJS = [
    "DJ Bally", "DJ Big N", "DJ Cuppy", "DJ Enimoney", "DJ Kaywise", "KDDO",
    "Masterkraft", "Josiah Jachimike Okonkwo", "DJ Shawn", "DJ Switch",
    "DJ Xclusive",
]

# Wikipedia: Category:Nigerian women rappers
WIKI_WOMEN_RAPPERS = [
    "Munachi Abii", "Eva Alordiah", "Anike", "Bouqui", "Goldie Harvey",
    "Little Simz", "Mo'Cheddah", "Mz Kiss", "Sasha P", "Weird MC",
]

# Wikipedia: Category:Nigerian child singers
WIKI_CHILD_SINGERS = [
    "Iseoluwa Abidemi", "Amarachi", "Lyta", "Makayla Malaka", "Zayn Africa",
]


# User-curated 100-artist list (50 North + 50 South) with state attribution
# and at least one representative song per artist. Source cited by user:
# unorthodoxreviews.com/most-notable-nigerian-musicians +
# the49thstreet.com. Structure: (name, region, state_area, representative_song).
USER_CURATED_100: list[tuple[str, str, str, str]] = [
    # --- NORTH ---
    ("DJ AB", "North", "Kaduna", "Totally"),
    ("Ali Jita", "North", "Kano", "Madam"),
    ("Ado Gwanja", "North", "Kano", "Mariya"),
    ("Namenj", "North", "Adamawa", "Rayuwata"),
    ("BOC Madaki", "North", "Kano", "Matar Jami’a"),
    ("ClassiQ", "North", "Kaduna", "Karammiskiya"),
    ("Morell", "North", "Kano", "Manso"),
    ("Hamisu Breaker", "North", "Katsina", "Daga Yarda"),
    ("Salim Smart", "North", "Katsina", "Ina So"),
    ("Adam A. Zango", "North", "Kaduna", "Baba Allah"),
    ("Nura M. Inuwa", "North", "Kano", "Bakon Ciki"),
    ("Auta Waziri", "North", "Sokoto", "Matar Aure"),
    ("Sadiq Zazzabi", "North", "Kano", "Bikin Suna"),
    ("Naziru Sarkin Waka", "North", "Kano", "Mata"),
    ("Rarara", "North", "Kano", "Sai Baba"),
    ("Hamisu Lamido", "North", "Kano", "Kece"),
    ("Khalifa Isma’il", "North", "Kano", "Soyayya"),
    ("Rabi’u Rikadawa", "North", "Katsina", "Kiyi Hakuri"),
    ("Ibrahim Sharif", "North", "Kano", "Baba"),
    ("Dan Musa", "North", "Jigawa", "Zuciya"),
    ("Lilin Baba", "North", "Kaduna", "Bani Da Lokaci"),
    ("Al’ameen", "North", "Kano", "Matar So"),
    ("Shehu Bello", "North", "Kano", "Aure"),
    ("Kawu Dan Sarki", "North", "Kano", "Zuciya"),
    ("Ado Ibro", "North", "Kano", "Kwana Casa’in"),
    ("Sa’idu Goma", "North", "Kano", "Soyayyar Mace"),
    ("Tijjani Gandu", "North", "Kano", "Gaskiya"),
    ("Sirajo Jibo", "North", "Kaduna", "Taimako"),
    ("Ibrahim Disu", "North", "Katsina", "Na Riki"),
    ("Sani Ahmad", "North", "Kaduna", "Rayuwa"),
    ("Haruna Ujiri", "North", "Borno", "Barka da Sallah"),
    ("Jigsaw", "North", "Kano", "Wakar Soyayya"),
    ("Bawa Bula", "North", "Niger", "Kyakkyawa"),
    ("DJ Baddo", "North", "Kano", "Northern Mix"),
    ("Oga Abdul", "North", "Niger", "Gidan Waka"),
    ("Fati Niger", "North", "Niger", "Yar Gaskiya"),
    ("Hadiza Sani Goma", "North", "Kano", "Gimbiya"),
    ("Maryam A. Usman", "North", "Kaduna", "So Da Kauna"),
    ("Gombe Boy", "North", "Gombe", "Labarin So"),
    ("Musty Sango", "North", "Kano", "Soyayya"),
    ("Umar M. Shareef", "North", "Kano", "Matar Aure"),
    ("Ishaq Dan Isa", "North", "Sokoto", "Ina Son Ki"),
    ("Isah Ayagi", "North", "Katsina", "Zan Iya"),
    ("Balarabe Maikura", "North", "Kano", "Kudi"),
    ("Ahmad S. Nuhu", "North", "Bauchi", "Muna Kauna"),
    ("Sa’ad Chika", "North", "Kebbi", "Na Gode"),
    ("Abdul D One", "North", "Kano", "Babu Ke"),
    ("Musa Jambo", "North", "Kaduna", "Aminiya"),
    ("Abdullahi Danko", "North", "Kano", "Hawaye"),
    ("Lado Ahmad", "North", "Kaduna", "Tunani"),
    # --- SOUTH ---
    ("Burna Boy", "South", "Rivers", "Last Last"),
    ("Wizkid", "South", "Lagos", "Essence"),
    ("Davido", "South", "Osun", "Unavailable"),
    ("Tiwa Savage", "South", "Ogun", "Eminado"),
    ("Yemi Alade", "South", "Edo", "Johnny"),
    ("Olamide", "South", "Ogun", "Rock"),
    ("Flavour", "South", "Anambra", "Nwa Baby"),
    ("Phyno", "South", "Anambra", "Fada Fada"),
    ("2Baba", "South", "Benue", "African Queen"),
    ("Adekunle Gold", "South", "Lagos", "Sade"),
    ("Tekno", "South", "Delta", "Pana"),
    ("Timaya", "South", "Bayelsa", "Dem Mama"),
    ("Mr Eazi", "South", "Edo", "Leg Over"),
    ("Rema", "South", "Edo", "Calm Down"),
    ("Ayra Starr", "South", "Lagos", "Rush"),
    ("Fireboy DML", "South", "Ogun", "Peru"),
    ("Joeboy", "South", "Edo", "Baby"),
    ("Simi", "South", "Lagos", "Duduke"),
    ("Niniola", "South", "Lagos", "Maradona"),
    ("Asake", "South", "Lagos", "Lonely at the Top"),
    ("Kizz Daniel", "South", "Ogun", "Buga"),
    ("Mayorkun", "South", "Lagos", "Geng"),
    ("Portable", "South", "Ogun", "Zazoo Zehh"),
    ("Bella Shmurda", "South", "Lagos", "Cash App"),
    ("Zlatan", "South", "Ogun", "Lagos Anthem"),
    ("Omah Lay", "South", "Rivers", "Soso"),
    ("CKay", "South", "Anambra", "Love Nwantiti"),
    ("Tems", "South", "Lagos", "Free Mind"),
    ("L.A.X", "South", "Lagos", "Run Away"),
    ("D'banj", "South", "Ogun", "Fall in Love"),
    ("Banky W", "South", "Lagos", "Lagos Party"),
    ("9ice", "South", "Oyo", "Gongo Aso"),
    ("Ruger", "South", "Lagos", "Bounce"),
    ("Skepta", "South", "Lagos", "Shutdown"),
    ("Patoranking", "South", "Lagos", "My Woman My Everything"),
    ("Kcee", "South", "Anambra", "Limpopo"),
    ("Flossing", "South", "Delta", "Omo Ologo"),
    ("Duncan Mighty", "South", "Rivers", "Obianuju"),
    ("Sound Sultan", "South", "Ogun", "Jagbajantis"),
    ("Naira Marley", "South", "Lagos", "Soapy"),
    ("Chike", "South", "Anambra", "Running"),
    ("M.I Abaga", "South", "Plateau", "One Naira"),
    ("Falz", "South", "Lagos", "Soldier"),
    ("Di'ja", "South", "Kaduna", "Akwaba"),
    ("Cobhams Asuquo", "South", "Cross River", "Ordinary People"),
    ("Timi Dakolo", "South", "Bayelsa", "Iyawo Mi"),
    ("May D", "South", "Ogun", "Ile Ijo"),
    ("Skales", "South", "Edo", "Shake Body"),
]


# Second user-curated batch (+25 North, +25 South). Many repeat names from
# USER_CURATED_100 but with a different representative song; those will
# append to the song list for the existing row rather than duplicate.
# Source cited by user: eyesofalagosboy.com/2025/09/12/playlist-hot-sounds-from-the-north
USER_CURATED_50_MORE: list[tuple[str, str, str, str]] = [
    # North
    ("Sa’adou Bori", "North", "Niger Republic/Northern scene", "Soyeya"),
    ("Abdu Boda", "North", "Northern Nigeria", "Asha Ruwa"),
    ("Dan Musa New Prince", "North", "Northern Nigeria", "Auren Ahmed & Aisha"),
    ("Prince Mk Baagi", "North", "Niger", "Nupe Vibe"),
    ("Maryam Fantimoti", "North", "Northern Nigeria", "Jigida"),
    ("Dauda Kahutu Rarara", "North", "Kano", "Rika Dai Dijima"),
    ("Sogha Niger", "North", "Niger", "Dan Kwali"),
    ("Nazir M. Ahmad", "North", "Kano", "Anatayi Muna Taji"),
    ("Ali Jita", "North", "Kano", "Saminai Remix"),
    ("DJ AB", "North", "Kaduna", "Kude"),
    ("Morell", "North", "Kano", "Gaskiya"),
    ("Ado Gwanja", "North", "Kano", "Aure"),
    ("Hamisu Breaker", "North", "Katsina", "Kin Raina Ni"),
    ("Salim Smart", "North", "Katsina", "Mata"),
    ("Nura M. Inuwa", "North", "Kano", "Soyayya"),
    ("Naziru M. Ahmad", "North", "Kano", "Matan Arewa"),
    ("ClassiQ", "North", "Kaduna", "Gudu"),
    ("BOC Madaki", "North", "Kano", "Harmattan"),
    ("Adam A. Zango", "North", "Kaduna", "Mata"),
    ("Auta Waziri", "North", "Sokoto", "Soyayya"),
    ("Rarara", "North", "Kano", "Sai Baba"),
    ("Al’ameen", "North", "Kano", "Kauna"),
    ("Sadiq Zazzabi", "North", "Kano", "Kwana Casa’in"),
    ("Kawu Dan Sarki", "North", "Kano", "Zuciya"),
    ("Ishaq Dan Isa", "North", "Sokoto", "Ina Son Ki"),
    # South
    ("Olamide", "South", "Ogun", "Melo Melo"),
    ("Wizkid", "South", "Lagos", "Ojuelegba"),
    ("Davido", "South", "Osun", "Fall"),
    ("Burna Boy", "South", "Rivers", "Ye"),
    ("Tems", "South", "Lagos", "Higher"),
    ("Fireboy DML", "South", "Ogun", "Need You"),
    ("Asake", "South", "Lagos", "Sungba"),
    ("Simi", "South", "Lagos", "Joromi"),
    ("Kizz Daniel", "South", "Ogun", "One Ticket"),
    ("Ayra Starr", "South", "Lagos", "Bloody Samaritan"),
    ("Joeboy", "South", "Edo", "Alcohol"),
    ("Niniola", "South", "Lagos", "Boda Sodiq"),
    ("Tiwa Savage", "South", "Ogun", "Somebody’s Son"),
    ("Yemi Alade", "South", "Edo", "Oh My Gosh"),
    ("Phyno", "South", "Anambra", "Connect"),
    ("Flavour", "South", "Anambra", "Ada Ada"),
    ("2Baba", "South", "Benue", "Implication"),
    ("Patoranking", "South", "Lagos", "Celebrate Me"),
    ("Tekno", "South", "Delta", "Enjoy"),
    ("Timaya", "South", "Bayelsa", "Sanko"),
    ("CKay", "South", "Anambra", "Emiliana"),
    ("Bella Shmurda", "South", "Lagos", "Dagbana"),
    ("Omah Lay", "South", "Rivers", "Attention"),
    ("Ruger", "South", "Lagos", "Asiwaju"),
    ("BNXN", "South", "Lagos", "Gwagwalada"),
]


# Third user-curated batch (+25 North, +25 South). Source cited by user:
# the49thstreet.com/five-northern-artistes-that-should-be-on-your-playlist
USER_CURATED_BATCH_3: list[tuple[str, str, str, str]] = [
    # North
    ("Saoty Arewa", "North", "Kano", "Arewa"),
    ("Dauda Kahutu Rarara", "North", "Kano", "Sai Baba"),
    ("General Hassan", "North", "Kano", "So Na Gaskiya"),
    ("Auwal Danladi", "North", "Katsina", "Hankali"),
    ("Hamisu Breaker", "North", "Katsina", "Kin Gani"),
    ("Ishaq Auta", "North", "Kano", "Soyayya"),
    ("Nazir Sarkin Waka", "North", "Kano", "Matan Arewa"),
    ("Ado Gwanja", "North", "Kano", "Mariya"),
    ("Nura M. Inuwa", "North", "Kano", "Labarina"),
    ("Ali Jita", "North", "Kano", "Gwamnatin So"),
    ("DJ AB", "North", "Kaduna", "Babarsa"),
    ("Morell", "North", "Kano", "Maza"),
    ("BOC Madaki", "North", "Kano", "Kowa"),
    ("ClassiQ", "North", "Kaduna", "Taraba"),
    ("Adam A. Zango", "North", "Kaduna", "Matan Arewa"),
    ("Salim Smart", "North", "Katsina", "Jamilatu"),
    ("Auta Waziri", "North", "Sokoto", "Uwa"),
    ("Kawu Dan Sarki", "North", "Kano", "Gaskiya"),
    ("Rarara", "North", "Kano", "Kudi"),
    ("Ado Ibro", "North", "Kano", "Mata"),
    ("Sadiq Zazzabi", "North", "Kano", "Kwana Casa’in"),
    ("Dan Musa", "North", "Jigawa", "Soyayya"),
    ("Lilin Baba", "North", "Kaduna", "Gida"),
    ("Isah Ayagi", "North", "Katsina", "Zuciya"),
    ("Balarabe Maikura", "North", "Kano", "Rayuwa"),
    # South
    ("Ycee", "South", "Lagos", "Jagaban"),
    ("Reekado Banks", "South", "Lagos", "Ozumba Mbadiwe"),
    ("Cobhams Asuquo", "South", "Cross River", "One Hit"),
    ("Falz", "South", "Lagos", "Bop Daddy"),
    ("Vector", "South", "Lagos", "King Kong"),
    ("M.I Abaga", "South", "Plateau", "Bad Belle"),
    ("Blaqbonez", "South", "Lagos", "Like Ice Spice"),
    ("Ladipoe", "South", "Lagos", "Feeling"),
    ("9ice", "South", "Oyo", "Photocopy"),
    ("Pasuma", "South", "Ogun", "Risky"),
    ("Saheed Osupa", "South", "Ogun", "Oba Nla"),
    ("K1 De Ultimate", "South", "Lagos", "Talazo"),
    ("Teni", "South", "Ekiti", "Case"),
    ("Lojay", "South", "Lagos", "Monalisa"),
    ("Oxlade", "South", "Lagos", "Kulosa"),
    ("Chike", "South", "Anambra", "On the Moon"),
    ("BNXN", "South", "Lagos", "Mood"),
    ("T.I Blaze", "South", "Ogun", "Sometimes"),
    ("Seyi Vibez", "South", "Lagos", "Chance"),
    ("Mohbad", "South", "Ogun", "KPK"),
    ("Portable", "South", "Ogun", "ZaZoo"),
    ("Zinoleesky", "South", "Lagos", "Gone Far"),
    ("Goya Menor", "South", "Edo", "Ameno Amapiano Remix"),
    ("Magnito", "South", "Lagos", "If To Say I Be Girl"),
    ("Bella Alubo", "South", "Edo", "Lagos 2 Abuja"),
]


# Fourth user-curated batch (+25 North, +25 South). Names only — no state
# or songs this round.
USER_CURATED_BATCH_4: list[tuple[str, str, str, str]] = [
    # North
    ("FirstKlaz", "North", "", ""),
    ("OG Abbah", "North", "", ""),
    ("Rumerh", "North", "", ""),
    ("Msquare Nahh", "North", "", ""),
    ("Boyskido", "North", "", ""),
    ("Feezy", "North", "", ""),
    ("Namenj", "North", "", ""),
    ("Ice Prince", "North", "", ""),
    ("Jesse Jagz", "North", "", ""),
    ("eLDee", "North", "", ""),
    ("Magnito", "North", "", ""),
    ("Saoty Arewa", "North", "", ""),
    ("Abdul D One", "North", "", ""),
    ("Lado Ahmad", "North", "", ""),
    ("Musa Jambo", "North", "", ""),
    ("Abdullahi Danko", "North", "", ""),
    ("Sa'ad Chika", "North", "", ""),
    ("Ahmad S. Nuhu", "North", "", ""),
    ("Bawa Bula", "North", "", ""),
    ("Fati Niger", "North", "", ""),
    ("Gombe Boy", "North", "", ""),
    ("Haruna Ujiri", "North", "", ""),
    ("Sirajo Jibo", "North", "", ""),
    ("Ibrahim Disu", "North", "", ""),
    ("Sani Ahmad", "North", "", ""),
    # South
    ("Ycee", "South", "", ""),
    ("Reekado Banks", "South", "", ""),
    ("Falz", "South", "", ""),
    ("Vector", "South", "", ""),
    ("M.I Abaga", "South", "", ""),
    ("Blaqbonez", "South", "", ""),
    ("Ladipoe", "South", "", ""),
    ("Teni", "South", "", ""),
    ("Lojay", "South", "", ""),
    ("Oxlade", "South", "", ""),
    ("T.I Blaze", "South", "", ""),
    ("Seyi Vibez", "South", "", ""),
    ("Mohbad", "South", "", ""),
    ("Zinoleesky", "South", "", ""),
    ("Goya Menor", "South", "", ""),
    ("Qing Madi", "South", "", ""),
    ("Llona", "South", "", ""),
    ("NezaBoy", "South", "", ""),
    ("Yemzzy", "South", "", ""),
    ("TML Vibez", "South", "", ""),
    ("CupidSzn", "South", "", ""),
    ("Oladapo", "South", "", ""),
    ("Odumodu Blvck", "South", "", ""),
    ("Young Jonn", "South", "", ""),
    ("Minz", "South", "", ""),
]


# Fifth user-curated batch (+25 North, +25 South).
USER_CURATED_BATCH_5: list[tuple[str, str, str, str]] = [
    # North
    ("Momee Gombe", "North", "", ""),
    ("Auta Mg Boy", "North", "", ""),
    ("Sadiq Saleh", "North", "", ""),
    ("Wizard Chan", "North", "", ""),
    ("Neeja", "North", "", ""),
    ("Gaise Baba", "North", "", ""),
    ("Greatman Takit", "North", "", ""),
    ("Sani Ahmad", "North", "", ""),
    ("Zubi", "North", "", ""),
    ("DJ 4Kerty", "North", "", ""),
    ("Tolibian", "North", "", ""),
    ("Muyeez", "North", "", ""),
    ("Musicbwoy", "North", "", ""),
    ("Msquare", "North", "", ""),
    ("Feezy Northern", "North", "", ""),
    ("Nura Suleja", "North", "", ""),
    ("Waziri Anka", "North", "", ""),
    ("Dahiru Wali", "North", "", ""),
    ("Musa Dankwairo", "North", "", ""),
    ("Sani Danja", "North", "", ""),
    ("Nasiru Jikan", "North", "", ""),
    ("Aminu Ladan", "North", "", ""),
    ("Malam Maidoki", "North", "", ""),
    ("Hussaini Dankoton Kasa", "North", "", ""),
    ("Mukhtar Sarkin Goge", "North", "", ""),
    # South
    ("Shallipopi", "South", "", ""),
    ("ZerryDL", "South", "", ""),
    ("Famous Pluto", "South", "", ""),
    ("Odumodu Blvck", "South", "", ""),
    ("Khaid", "South", "", ""),
    ("Ayo Maff", "South", "", ""),
    ("Victor AD", "South", "", ""),
    ("Bad Boy Timz", "South", "", ""),
    ("Cheque", "South", "", ""),
    ("Poco Lee", "South", "", ""),
    ("Brymo", "South", "", ""),
    ("Harrysong", "South", "", ""),
    ("Erigga", "South", "", ""),
    ("Runtown", "South", "", ""),
    ("P-Square", "South", "", ""),
    ("Rude Boy", "South", "", ""),
    ("Sinach", "South", "", ""),
    ("Ada Ehi", "South", "", ""),
    ("Dunsin Oyekan", "South", "", ""),
    ("TY Bello", "South", "", ""),
    ("Umu Obiligbo", "South", "", ""),
    ("Anyidons", "South", "", ""),
    ("Juno", "South", "", ""),
    ("Champz", "South", "", ""),
    ("Barry Jhay", "South", "", ""),
]


# Sixth user-curated batch (+25 North, +25 South).
USER_CURATED_BATCH_6: list[tuple[str, str, str, str]] = [
    # North
    ("OG Abbah", "North", "", ""),
    ("Musta4a", "North", "", ""),
    ("Wizard Chan", "North", "", ""),
    ("Neeja", "North", "", ""),
    ("Gaise Baba", "North", "", ""),
    ("Greatman Takit", "North", "", ""),
    ("Tolibian", "North", "", ""),
    ("Musicbwoy", "North", "", ""),
    ("Zubi", "North", "", ""),
    ("DJ 4Kerty", "North", "", ""),
    ("Muyeez", "North", "", ""),
    ("Nura Suleja", "North", "", ""),
    ("Waziri Anka", "North", "", ""),
    ("Dahiru Wali", "North", "", ""),
    ("Musa Dankwairo", "North", "", ""),
    ("Sani Danja", "North", "", ""),
    ("Nasiru Jikan", "North", "", ""),
    ("Aminu Ladan", "North", "", ""),
    ("Malam Maidoki", "North", "", ""),
    ("Hussaini Dankoton Kasa", "North", "", ""),
    ("Mukhtar Sarkin Goge", "North", "", ""),
    ("Momee Gombe", "North", "", ""),
    ("Auta Mg Boy", "North", "", ""),
    ("Sadiq Saleh", "North", "", ""),
    ("Msquare Nahh", "North", "", ""),
    # South
    ("Mavo", "South", "", ""),
    ("Champz", "South", "", ""),
    ("Moravey", "South", "", ""),
    ("Elestee", "South", "", ""),
    ("Zaylevelten", "South", "", ""),
    ("oSHAMO", "South", "", ""),
    ("Shoday", "South", "", ""),
    ("Ayomaf", "South", "", ""),
    ("TML Vibez", "South", "", ""),
    ("Morravey", "South", "", ""),
    ("Skiibii", "South", "", ""),
    ("DJ Neptune", "South", "", ""),
    ("Johnny Drille", "South", "", ""),
    ("Broda Shaggi", "South", "", ""),
    ("Emmkoo", "South", "", ""),
    ("Abbey Ojomu", "South", "", ""),
    ("Monaky", "South", "", ""),
    ("Davolee", "South", "", ""),
    ("MC Galaxy", "South", "", ""),
    ("Beautiful Nubia", "South", "", ""),
    ("Ola Dips", "South", "", ""),
    ("Tiimie", "South", "", ""),
    ("Odunsi The Engine", "South", "", ""),
    ("TAR1Q", "South", "", ""),
    ("JoBlaq", "South", "", ""),
]


def all_user_curated() -> list[tuple[str, str, str, str]]:
    """Flatten all user-curated batches in order (later wins for region, songs accumulate)."""
    return (
        USER_CURATED_100
        + USER_CURATED_50_MORE
        + USER_CURATED_BATCH_3
        + USER_CURATED_BATCH_4
        + USER_CURATED_BATCH_5
        + USER_CURATED_BATCH_6
    )

# Earlier curated additions from first pass
CURATED_ADDITIONS = [
    ("Runtown", "Afrobeats/Afropop"), ("Skales", "Afrobeats/Afropop"),
    ("May D", "Afrobeats/Afropop"), ("Dr SID", "Afrobeats/Afropop"),
    ("Tony Tetuila", "Afrobeats/Afropop"), ("Di'ja", "Afrobeats/Afropop"),
    ("Jaywon", "Afrobeats/Afropop"), ("Orezi", "Afrobeats/Afropop"),
    ("Terry G", "Afrobeats/Afropop"), ("Cynthia Morgan", "Afrobeats/Afropop"),
    ("Victoria Kimani", "Afrobeats/Afropop"), ("Omawumi", "Afrobeats/Afropop"),
    ("Chidinma", "Afrobeats/Afropop"), ("Mo'Cheddah", "Afrobeats/Afropop"),
    ("Waconzy", "Afrobeats/Afropop"), ("Emma Nyra", "Afrobeats/Afropop"),
    ("L.A.X", "Afrobeats/Afropop"), ("Ketchup", "Afrobeats/Afropop"),
    ("Liya", "Afrobeats/Afropop"), ("T'neeya", "Afrobeats/Afropop"),
    ("Fave", "Afrobeats/Afropop"), ("Guchi", "Afrobeats/Afropop"),
    ("Goya Menor", "Afrobeats/Afropop"), ("Zerry DL", "Afrobeats/Afropop"),
    ("Balloranking", "Afrobeats/Afropop"), ("Tolani", "Afrobeats/Afropop"),
    ("Barry Jhay", "Afrobeats/Afropop"), ("Timi Dakolo", "Afrobeats/Afropop"),
    ("Ajebo Hustlers", "Afrobeats/Afropop"), ("Odeal", "Afrobeats/Afropop"),
    ("Lifesize Teddy", "Afrobeats/Afropop"), ("Shoday", "Afrobeats/Afropop"),
    ("Sean Dampte", "Afrobeats/Afropop"), ("Ruggedman", "Hip-Hop/Rap"),
    ("Modenine", "Hip-Hop/Rap"), ("Eedris Abdulkareem", "Hip-Hop/Rap"),
    ("Weird MC", "Hip-Hop/Rap"), ("Sasha P", "Hip-Hop/Rap"),
    ("Eva Alordiah", "Hip-Hop/Rap"), ("Ikechukwu (Killz)", "Hip-Hop/Rap"),
    ("Payper Corleone", "Hip-Hop/Rap"), ("PsychoYP", "Hip-Hop/Rap"),
    ("Zilla Oaks", "Hip-Hop/Rap"), ("A-Q", "Hip-Hop/Rap"),
    ("Loose Kaynon", "Hip-Hop/Rap"), ("Boogey", "Hip-Hop/Rap"),
    ("Paybac Iboro", "Hip-Hop/Rap"), ("Tec", "Hip-Hop/Rap"), ("Ghost", "Hip-Hop/Rap"),
    ("Straffitti", "Hip-Hop/Rap"), ("Tomi Thomas", "Alté/Indie"),
    ("Jinmi Abduls", "Alté/Indie"), ("Somadina", "Alté/Indie"),
    ("Temi DollFace", "Alté/Indie"), ("Deena Ade", "Alté/Indie"),
    ("BenjiFlow", "Alté/Indie"), ("DRB Lasgidi", "Alté/Indie"),
    ("Saeon", "Alté/Indie"), ("Dami Oniru", "Alté/Indie"), ("Projexx", "Alté/Indie"),
    ("Sinach", "Gospel"), ("Frank Edwards", "Gospel"), ("Mercy Chinwo", "Gospel"),
    ("Nathaniel Bassey", "Gospel"), ("Tope Alabi", "Gospel"),
    ("Yinka Ayefele", "Gospel"), ("Tim Godfrey", "Gospel"), ("Samsong", "Gospel"),
    ("Buchi", "Gospel"), ("Sonnie Badu", "Gospel"), ("Joe Praize", "Gospel"),
    ("Preye Odede", "Gospel"), ("Moses Bliss", "Gospel"),
    ("Minister GUC", "Gospel"), ("Judikay", "Gospel"), ("Ada Ehi", "Gospel"),
    ("Eben", "Gospel"), ("Dunsin Oyekan", "Gospel"),
    ("Prospa Ochimana", "Gospel"), ("Mike Abdul", "Gospel"),
    ("Nikki Laoye", "Gospel"), ("Chioma Jesus", "Gospel"), ("Yadah", "Gospel"),
    ("Kenny K'ore", "Gospel"), ("Lawrence Oyor", "Gospel"),
    ("Theophilus Sunday", "Gospel"), ("Peterson Okopi", "Gospel"),
    ("Midnight Crew", "Gospel"), ("Ebuka Songs", "Gospel"), ("Neeta", "Gospel"),
    ("Bright Chimezie", "Highlife"), ("Kcee", "Highlife"),
    ("Umu Obiligbo", "Highlife"), ("Zoro", "Highlife"), ("Slowdog", "Highlife"),
    ("Mr Raw", "Highlife"), ("Pericoma Okoye", "Highlife"),
    ("J Martins", "Highlife"), ("KWAM 1 (King Wasiu Ayinde Marshal)", "Fuji/Apala"),
    ("Saheed Osupa", "Fuji/Apala"), ("Pasuma (Wasiu Alabi)", "Fuji/Apala"),
    ("Taye Currency", "Fuji/Apala"), ("Abass Akande Obesere", "Fuji/Apala"),
    ("Kollington Ayinla", "Fuji/Apala"), ("Remi Aluko", "Fuji/Apala"),
    ("Muri Thunder", "Fuji/Apala"), ("Sule Alao Malaika", "Fuji/Apala"),
    ("Sefiu Alao Adekunle", "Fuji/Apala"), ("Sir Shina Peters", "Juju"),
    ("Dele Taiwo", "Juju"), ("Segun Adewale", "Juju"), ("Adewale Ayuba", "Juju"),
    ("Daddy Showkey", "Reggae/Dancehall"), ("Daddy Fresh", "Reggae/Dancehall"),
    ("Orits Wiliki", "Reggae/Dancehall"), ("Shank", "Reggae/Dancehall"),
    ("Oritse Femi", "Reggae/Dancehall"), ("Femi Kuti", "Afrobeat"),
    ("Seun Kuti", "Afrobeat"), ("Made Kuti", "Afrobeat"), ("Yeni Kuti", "Afrobeat"),
    ("Dede Mabiaku", "Afrobeat"), ("Ali Jita", "Hausa/Northern"),
    ("Nazifi Asnanic", "Hausa/Northern"), ("Adam A. Zango", "Hausa/Northern"),
    ("Classiq", "Hausa/Northern"), ("Morell", "Hausa/Northern"),
    ("Rarara", "Hausa/Northern"), ("Abdul D One", "Hausa/Northern"),
    ("Hamisu Breaker", "Hausa/Northern"), ("DJ AB", "Hausa/Northern"),
    ("Ceeboi", "Hausa/Northern"), ("Onyeka Onwenu", "Legacy/Veteran"),
    ("Majek Fashek", "Legacy/Veteran"), ("Ras Kimono", "Legacy/Veteran"),
    ("Christy Essien-Igbokwe", "Legacy/Veteran"),
    ("Sonny Okosun", "Legacy/Veteran"), ("Bongos Ikwue", "Legacy/Veteran"),
    ("Orlando Owoh", "Legacy/Veteran"), ("I.K. Dairo", "Legacy/Veteran"),
    ("Paul Play Dairo", "Legacy/Veteran"), ("Oliver De Coque", "Legacy/Veteran"),
    ("Osita Osadebe", "Legacy/Veteran"), ("Mike Ejeagha", "Legacy/Veteran"),
    ("Victor Uwaifo", "Legacy/Veteran"), ("William Onyeabor", "Legacy/Veteran"),
    ("Haruna Ishola", "Legacy/Veteran"), ("Ayinla Omowura", "Legacy/Veteran"),
    ("Sikiru Ayinde Barrister", "Legacy/Veteran"),
    ("Celestine Ukwu", "Legacy/Veteran"),
    ("Prince Nico Mbarga", "Legacy/Veteran"), ("Rex Lawson", "Legacy/Veteran"),
    ("Dan Maraya Jos", "Legacy/Veteran"), ("Styl-Plus", "2000s-era"),
    ("Plantashun Boiz", "2000s-era"), ("Faze", "2000s-era"),
    ("Blackface Naija", "2000s-era"), ("Trybesmen", "2000s-era"),
    ("Maintain", "2000s-era"), ("Kelly Handsome", "2000s-era"),
    ("KC Presh", "2000s-era"), ("Artquake", "2000s-era"), ("Zule Zoo", "2000s-era"),
    ("Mandy Thunder", "2000s-era"), ("Dagrin", "2000s-era"),
    ("Goldie Harvey", "2000s-era"), ("Kefee", "2000s-era"),
    ("Don Jazzy", "Producer-Artist"), ("Masterkraft", "Producer-Artist"),
    ("Larry Gaaga", "Producer-Artist"), ("Kel P", "Producer-Artist"),
    ("Altims", "Producer-Artist"), ("P.Priime", "Producer-Artist"),
    ("Killertunes", "Producer-Artist"), ("Eskeez", "Producer-Artist"),
]

SOURCE_BUCKETS: list[tuple[str, str, list[str]]] = [
    # (source_label, category, names)
    ("Wikipedia – List of Nigerian musicians", "Multi-genre", WIKI_MAIN_LIST),
    ("Wikipedia – Category:Nigerian musicians", "Multi-genre", WIKI_CATEGORY_MISC),
    ("Wikipedia – Category:Nigerian male singers", "Male Singer", WIKI_MALE_SINGERS),
    ("Wikipedia – Category:Nigerian women singers", "Female Singer", WIKI_WOMEN_SINGERS),
    ("Wikipedia – Category:Nigerian singers", "Singer", WIKI_SINGERS),
    ("Wikipedia – Category:Nigerian rappers", "Hip-Hop/Rap", WIKI_RAPPERS),
    ("Wikipedia – Category:Nigerian pop singers", "Pop", WIKI_POP),
    ("Wikipedia – Category:Nigerian Afrobeats musicians", "Afrobeats/Afropop", WIKI_AFROBEATS),
    ("Wikipedia – Nigerian gospel musicians (list + category)", "Gospel", WIKI_GOSPEL),
    ("Wikipedia – Category:Nigerian highlife musicians", "Highlife", WIKI_HIGHLIFE),
    ("Wikipedia – Category:Nigerian reggae musicians", "Reggae/Dancehall", WIKI_REGGAE),
    ("Wikipedia – Category:Nigerian record producers", "Producer-Artist", WIKI_PRODUCERS),
    ("TurnTable Charts (turntablecharts.com/charts/1 Top 100)", "Charting Artist", TURNTABLE_ARTISTS),
    ("kworb.net Nigeria Spotify daily chart", "Charting Artist", KWORB_SPOTIFY_NG),
    (
        "Hausa/Northern sources (Wikipedia Hausa music + Last.fm + trade press)",
        "Hausa/Northern",
        HAUSA_NORTHERN,
    ),
    (
        "Boomplay NG (manual – scraping blocked, compiled from Chartmetric HMC)",
        "Charting Artist",
        BOOMPLAY_NG,
    ),
    ("kworb.net Nigeria Apple Music chart", "Charting Artist", KWORB_APPLE_NG),
    (
        "Wikipedia – List of number-one songs in Nigeria (2023–2026)",
        "Charting Artist",
        WIKI_NO1_SONGS_NG,
    ),
    ("Wikipedia – Category:Yoruba-language Nigerian singers", "Yoruba", WIKI_YORUBA_LANG),
    ("Wikipedia – Category:Igbo-language singers", "Igbo", WIKI_IGBO_LANG),
    ("Wikipedia – Category:Nigerian DJs", "DJ", WIKI_DJS),
    ("Wikipedia – Category:Nigerian women rappers", "Female Rapper", WIKI_WOMEN_RAPPERS),
    ("Wikipedia – Category:Nigerian child singers", "Child/Youth", WIKI_CHILD_SINGERS),
]


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

ALIAS_MAP = {
    # Map a normalized key → canonical normalized key.
    # These handle same-artist variants that differ by parenthetical content
    # and therefore don't collapse under normal normalisation.
    "odunsitheengine": "odunsi",   # "Odunsi the Engine" → "Odunsi"
}


def normalize_name(name: str) -> str:
    """Return a canonical key for dedupe.

    Aggressive: lowercases, strips diacritics, strips parenthetical
    disambiguators like "(singer)", then removes ALL non-alphanumerics
    (including spaces). This collapses variants like 'Odumodu Blvck' ↔
    'ODUMODUBLVCK', 'Rude Boy' ↔ 'Rudeboy', 'BOC Madaki' ↔ 'B.O.C Madaki'.
    Remaining same-artist variants are resolved via ALIAS_MAP.
    """
    name = unicodedata.normalize("NFKD", name)
    name = name.encode("ascii", "ignore").decode("ascii")
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)
    key = re.sub(r"[^a-zA-Z0-9]+", "", name).strip().lower()
    return ALIAS_MAP.get(key, key)


def clean_display_name(name: str) -> str:
    """Strip disambiguation parens from display name but keep original casing/diacritics."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()


# Names that are on Wikipedia's Nigerian-music lists but are primarily
# non-Nigerian OR non-musicians. Explicit exclude list.
EXCLUDE_NAMES = {
    normalize_name(n) for n in (
        # ---- not-primarily-musicians ----
        "Dizzee Rascal",              # British rapper (Ghanaian heritage)
        "Adesua Etomi-Wellington",    # actress, not primarily a musician
        "Genevieve Nnaji",            # actress
        "Nkem Owoh",                  # actor
        "Patience Ozokwor",           # actress
        "Stella Damasus",             # actress
        "Omotola Jalade Ekeinde",     # actress
        "Tonto Dikeh",                # actress
        "Ivie Okujaye",               # actress
        "Ken Erics",                  # actor
        "OC Ukeje",                   # actor
        "Helen Paul",                 # comedian
        "Klint da Drunk",             # comedian
        "Julius Agwu",                # comedian
        "Chigul",                     # comedian
        "Tunde Ednut",                # entertainer/comedian (now mostly social media)
        "Twyse Ereme",                # comedian
        "Cossy Orjiakor",             # actress
        "Shan George",                # actress
        "Uche Elendu",                # actress
        "Jennifer Eliogu",            # actress
        "Bukunmi Oluwasina",          # actress
        "Odunlade Adekola",           # actor
        "Segun Arinze",               # actor
        "Joseph Benjamin",            # TV host
        "Ali Nuhu",                   # actor (Hausa)
        "Hubert Ogunde",              # theatre founder (not primarily recorded music)
        "Becky Umeh",                 # actress
        "Joshua Mike-Bamiloye",       # filmmaker (gospel film)
        "Carter Efe",                 # skitmaker with occasional music
        # ---- non-Nigerian artists that appear on NG charts (kworb/TurnTable) ----
        "DJ Snake",                   # French DJ
        "Bruno Mars",                 # US
        "Harry Styles",               # UK
        "Eminem",                     # US
        "Billie Eilish",              # US
        "Drake",                      # Canadian
        "Future",                     # US
        "Offset",                     # US
        "NLE Choppa",                 # US
        "Roddy Ricch",                # US
        "Don Toliver",                # US
        "Dominic Fike",               # US
        "Stormzy",                    # UK
        "Black Sherif",               # Ghanaian
        "Fally Ipupa",                # DR Congo
        "Khalid",                     # US
        "Fridayy",                    # US
        "Skillibeng",                 # Jamaican
        "Tiakola",                    # French
        "Ruth B.",                    # Canadian
        "Tyla",                       # South African
        "Angelique Kidjo",            # Beninese
        "King Promise",               # Ghanaian
        "Didi B",                     # Ivorian
        "Alex Warren",                # US
        "Ella Langley",               # US
        "Lil Uzi Vert",               # US
        "DJ Maphorisa",               # South African
        "Scotts Maphuma",             # South African
        "Focalistic",                 # South African
        "Maglera Doe Boy",            # South African
        "TxC",                        # South African duo
        "Gunna",                      # US
        "Central Cee",                # UK
        "JAE5",                       # UK-Ghanaian producer
        # Skepta retained (user included in curated list for diaspora Lagos coverage)
        # Dave retained for the same reason — user may want diaspora coverage
        "Afro Nation",                # festival organisation, not an artist
        "Hurricane Wisdom",           # US
        "Bees & Honey",               # duo, ambiguous origin
        "Ella Mai",                   # UK
        "Fredo",                      # UK
        "Steel Banglez",              # UK producer
        "Jazzworx",                   # non-NG
        "Thukuthela",                 # SA
        "Jazzwrld",                   # non-NG
        "Serøtonin",                  # unclear origin
        "Jade LeMac",                 # Canadian
        "G4 Boyz",                    # US
        "Iphxne Dj",                  # unclear origin
    )
}


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def load_sample() -> list[dict]:
    with SAMPLE_CSV.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_chartmetric_ng() -> list[dict]:
    if not NG_CM_JSON.exists():
        return []
    with NG_CM_JSON.open() as f:
        return json.load(f)


def _blank_row(name: str, key: str) -> dict:
    return {
        "artist_name": name,
        "normalized_key": key,
        "country": "NG",
        "genre_category": "",
        "region": "",
        "state_area": "",
        "representative_song": "",
        "in_sample": "N",
        "cm_artist_id": "",
        "spotify_id": "",
        "youtube_id": "",
        "label": "",
        "source": "",
    }


def build_rows() -> tuple[list[dict], dict]:
    sample = load_sample()

    rows: list[dict] = []
    by_key: dict[str, dict] = {}

    # 1. Sample rows first
    for r in sample:
        key = normalize_name(r["artist_name"])
        row = _blank_row(r["artist_name"], key)
        row.update(
            {
                "country": r["country"] or "NG",
                "in_sample": "Y",
                "cm_artist_id": r["cm_artist_id"],
                "spotify_id": r["spotify_id"],
                "youtube_id": r["youtube_id"],
                "label": r["label"],
                "source": "NMAS sample (delivered Q1 2024 – Q4 2025)",
            }
        )
        rows.append(row)
        by_key[key] = row

    # 2. Chartmetric NG artists (from existing extraction)
    for a in load_chartmetric_ng():
        name = a["cm_name"].strip()
        key = normalize_name(name)
        if key in by_key or key in EXCLUDE_NAMES:
            continue
        row = _blank_row(name, key)
        row.update(
            {
                "cm_artist_id": str(a.get("cm_id", "")),
                "source": "Chartmetric (nigerian_artists_chartmetric.json)",
            }
        )
        rows.append(row)
        by_key[key] = row

    # 3. Wikipedia / TurnTable / kworb / Hausa / Boomplay buckets
    for source_label, category, names in SOURCE_BUCKETS:
        for raw in names:
            display = clean_display_name(raw)
            key = normalize_name(display)
            if not key or key in EXCLUDE_NAMES:
                continue
            if key in by_key:
                # Fill in genre if empty
                existing = by_key[key]
                if not existing["genre_category"] and existing["in_sample"] == "N":
                    existing["genre_category"] = category
                continue
            row = _blank_row(display, key)
            row.update({"genre_category": category, "source": source_label})
            rows.append(row)
            by_key[key] = row

    # 4. Earlier curated additions — only keep ones not already added,
    #    but preserve their more specific genre tags where useful.
    for name, category in CURATED_ADDITIONS:
        display = clean_display_name(name)
        key = normalize_name(display)
        if key in EXCLUDE_NAMES:
            continue
        if key in by_key:
            existing = by_key[key]
            if not existing["genre_category"] and existing["in_sample"] == "N":
                existing["genre_category"] = category
            continue
        row = _blank_row(display, key)
        row.update(
            {
                "genre_category": category,
                "source": "Curated population frame (publicly known NG artists)",
            }
        )
        rows.append(row)
        by_key[key] = row

    # 5. User-curated batches — add new rows, or annotate existing with
    #    region / state / song. Songs accumulate (comma-separated) when an
    #    artist appears across multiple batches.
    n_added_by_curated = 0
    n_annotated = 0
    for name, region, state, song in all_user_curated():
        display = clean_display_name(name)
        key = normalize_name(display)
        if not key:
            continue
        if key in by_key:
            row = by_key[key]
            if region and not row["region"]:
                row["region"] = region
            if state and not row["state_area"]:
                row["state_area"] = state
            if song:
                existing_songs = [s.strip() for s in row["representative_song"].split(",") if s.strip()]
                if song not in existing_songs:
                    existing_songs.append(song)
                    row["representative_song"] = ", ".join(existing_songs)
            # Tag source addition (don't overwrite sample attribution)
            if row["in_sample"] == "N" and "User-curated" not in row["source"]:
                existing = row["source"].strip()
                row["source"] = f"{existing}; User-curated list" if existing else "User-curated list"
            n_annotated += 1
            continue
        row = _blank_row(display, key)
        row.update(
            {
                "region": region,
                "state_area": state,
                "representative_song": song,
                "genre_category": "Hausa/Northern" if region == "North" else "",
                "source": "User-curated list (6 batches, Apr 2026)",
            }
        )
        rows.append(row)
        by_key[key] = row
        n_added_by_curated += 1

    rows.sort(key=lambda x: (x["in_sample"] != "Y", x["artist_name"].lower()))

    stats = {
        "sample_n": sum(1 for r in rows if r["in_sample"] == "Y"),
        "population_n": len(rows),
        "non_sample_n": sum(1 for r in rows if r["in_sample"] == "N"),
        "by_source": Counter(r["source"] for r in rows if r["in_sample"] == "N"),
        "by_category": Counter(r["genre_category"] or "Uncategorised" for r in rows if r["in_sample"] == "N"),
        "by_region": Counter(r["region"] or "Unknown" for r in rows if r["in_sample"] == "N"),
        "curated_added": n_added_by_curated,
        "curated_annotated": n_annotated,
        "with_song": sum(1 for r in rows if r["representative_song"]),
        "with_state": sum(1 for r in rows if r["state_area"]),
        "mcsn_members": MCSN_AGGREGATE_COUNT,
        "mcsn_songs": MCSN_SONGS_TRACKED,
    }
    return rows, stats


def write_csv(rows: list[dict]) -> None:
    fields = [
        "artist_name", "country", "region", "state_area", "genre_category",
        "representative_song", "in_sample", "cm_artist_id", "spotify_id",
        "youtube_id", "label", "source",
    ]
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def write_xlsx(rows: list[dict], stats: dict) -> None:
    from datetime import date as _date

    wb = Workbook()

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1F4E78")
    label_font = Font(bold=True)
    y_fill = PatternFill("solid", fgColor="E2F0D9")
    n_fill = PatternFill("solid", fgColor="FFF2CC")
    cover_title_font = Font(bold=True, size=18, color="1F4E78")
    cover_subtitle_font = Font(bold=True, size=12)

    sample_n = stats["sample_n"]
    pop_n = stats["population_n"]
    non_sample_n = stats["non_sample_n"]
    mcsn = stats["mcsn_members"]
    coverage_observed = sample_n / pop_n if pop_n else 0
    coverage_vs_mcsn = sample_n / mcsn if mcsn else 0

    # --- Cover ---
    wsc = wb.active
    wsc.title = "Cover"
    wsc["A1"] = "Nigeria Music Analytics System (NMAS)"
    wsc["A1"].font = cover_title_font
    wsc["A2"] = "Artist Population Frame — Deliverable #8"
    wsc["A2"].font = Font(bold=True, size=14)
    wsc["A4"] = "Prepared for:"
    wsc["A4"].font = label_font
    wsc["B4"] = "National Bureau of Statistics (NBS), Nigeria"
    wsc["A5"] = "Prepared by:"
    wsc["A5"].font = label_font
    wsc["B5"] = "Meertech — NMAS project team"
    wsc["A6"] = "Deliverable date:"
    wsc["A6"].font = label_font
    wsc["B6"] = _date.today().isoformat()
    wsc["A7"] = "Deliverable scope:"
    wsc["A7"].font = label_font
    wsc["B7"] = (
        "Consolidated artist population frame — sampled (131) plus additional known "
        "Nigerian artists — to enable NBS to gross up sample-based estimates to "
        "population-level totals."
    )
    wsc.merge_cells("B7:F7")
    wsc["B7"].alignment = Alignment(wrap_text=True, vertical="top")
    wsc.row_dimensions[7].height = 45

    wsc["A9"] = "Workbook contents"
    wsc["A9"].font = cover_subtitle_font
    toc = [
        ("1. Cover", "This sheet."),
        ("2. Summary", "Headline counts, coverage ratios, expansion factors, source/region/category breakdowns, methodology notes."),
        ("3. Sampled_Artists", f"The {sample_n} artists whose metrics were delivered to NBS (Q1 2024 – Q4 2025)."),
        ("4. All_Known_Artists", f"Full population frame — {pop_n} rows — with region (N/S), state, genre category, representative songs, and source provenance."),
        ("5. Estimation_Workings", "Worked example: how to expand sample totals to population using two defensible bounds."),
    ]
    for i, (sheet, desc) in enumerate(toc, start=10):
        wsc.cell(row=i, column=1, value=sheet).font = label_font
        wsc.cell(row=i, column=2, value=desc)
        wsc.merge_cells(start_row=i, start_column=2, end_row=i, end_column=6)
        wsc.cell(row=i, column=2).alignment = Alignment(wrap_text=True, vertical="top")
        wsc.row_dimensions[i].height = 32

    wsc["A17"] = "Headline figures"
    wsc["A17"].font = cover_subtitle_font
    headline = [
        ("Sampled artists", sample_n),
        ("Total named population frame", pop_n),
        ("MCSN aggregate members (ceiling)", f"{mcsn:,}"),
        ("Coverage vs named frame", f"{coverage_observed:.1%}"),
        ("Expansion factor (named frame)", f"{pop_n / sample_n:.3f}×"),
        ("Expansion factor (MCSN ceiling)", f"{mcsn / sample_n:.1f}×"),
    ]
    for i, (k, v) in enumerate(headline, start=18):
        wsc.cell(row=i, column=1, value=k).font = label_font
        wsc.cell(row=i, column=2, value=v)

    wsc.column_dimensions["A"].width = 32
    wsc.column_dimensions["B"].width = 60
    for col in ("C", "D", "E", "F"):
        wsc.column_dimensions[col].width = 18

    # --- Summary ---
    ws = wb.create_sheet("Summary")
    ws["A1"] = "NMAS Artist Population Frame — Summary (Expanded)"
    ws["A1"].font = Font(bold=True, size=14)
    ws.merge_cells("A1:C1")

    for i, cell in enumerate(("Metric", "Value", "Notes"), start=1):
        c = ws.cell(row=3, column=i, value=cell)
        c.font = header_font
        c.fill = header_fill

    rows_summary = [
        ("Sampled artists (delivered)", sample_n, "From Artist_Master_List.csv"),
        (
            "Additional known NG artists (named)",
            non_sample_n,
            "Aggregated from Wikipedia musicians lists/categories, TurnTable Charts, Chartmetric, curated",
        ),
        ("Total NAMED population frame", pop_n, "Sampled + additional with names"),
        (
            "Observed coverage ratio (sampled / named population)",
            f"{coverage_observed:.1%}",
            "First-cut grossing-up factor using the NAMED frame",
        ),
        (
            "Expansion factor vs named frame (1 / coverage)",
            f"{(1 / coverage_observed):.3f}" if coverage_observed else "n/a",
            "Multiply sample totals by this to estimate totals across the NAMED population",
        ),
        ("", "", ""),
        (
            "MCSN aggregate member count (ceiling)",
            mcsn,
            'Publicly stated on mcsnnigeria.org: "38,054+ Members"',
        ),
        (
            "MCSN songs tracked (context only)",
            stats["mcsn_songs"],
            '"450K+ Songs Tracked" on MCSN homepage',
        ),
        (
            "Coverage ratio (sampled / MCSN members)",
            f"{coverage_vs_mcsn:.2%}",
            "Lower-bound coverage vs the authoritative CMO denominator",
        ),
        (
            "Expansion factor vs MCSN",
            f"{(mcsn / sample_n):.1f}" if sample_n else "n/a",
            "Upper-bound industry-wide grossing-up factor",
        ),
        (
            "COSON members",
            "undisclosed",
            'cosonng.com states "thousands of members"; no public figure',
        ),
    ]
    for i, (k, v, note) in enumerate(rows_summary, start=4):
        ws.cell(row=i, column=1, value=k).font = label_font
        ws.cell(row=i, column=2, value=v)
        ws.cell(row=i, column=3, value=note)

    next_row = 4 + len(rows_summary) + 1
    ws.cell(row=next_row, column=1, value="Non-sampled additions by source").font = Font(bold=True, size=12)
    for i, cell in enumerate(("Source", "Count"), start=1):
        c = ws.cell(row=next_row + 1, column=i, value=cell)
        c.font = header_font
        c.fill = header_fill
    for i, (src, n) in enumerate(sorted(stats["by_source"].items(), key=lambda x: -x[1]), start=next_row + 2):
        ws.cell(row=i, column=1, value=src)
        ws.cell(row=i, column=2, value=n)

    cat_start = next_row + 3 + len(stats["by_source"])
    ws.cell(row=cat_start, column=1, value="Non-sampled additions by genre category").font = Font(bold=True, size=12)
    for i, cell in enumerate(("Genre Category", "Count"), start=1):
        c = ws.cell(row=cat_start + 1, column=i, value=cell)
        c.font = header_font
        c.fill = header_fill
    for i, (cat, n) in enumerate(sorted(stats["by_category"].items(), key=lambda x: -x[1]), start=cat_start + 2):
        ws.cell(row=i, column=1, value=cat)
        ws.cell(row=i, column=2, value=n)

    region_start = cat_start + 3 + len(stats["by_category"])
    ws.cell(row=region_start, column=1, value="Non-sampled additions by region (North/South)").font = Font(bold=True, size=12)
    for i, cell in enumerate(("Region", "Count"), start=1):
        c = ws.cell(row=region_start + 1, column=i, value=cell)
        c.font = header_font
        c.fill = header_fill
    for i, (reg, n) in enumerate(sorted(stats["by_region"].items(), key=lambda x: -x[1]), start=region_start + 2):
        ws.cell(row=i, column=1, value=reg)
        ws.cell(row=i, column=2, value=n)

    note_row = region_start + 3 + len(stats["by_region"])
    ws.cell(row=note_row, column=1, value="Methodology & caveats").font = Font(bold=True)
    notes = [
        "Two expansion factors are provided because the TRUE Nigerian artist population is unknown.",
        "Lower-bound: expand sample totals by (population / sample) using the NAMED frame. Use this for conservative estimates.",
        "Upper-bound: expand sample totals by (MCSN members / sample). Use this for industry-wide ceiling estimates. MCSN is the NCC-approved CMO and its member count is the best available authoritative denominator.",
        "COSON (cosonng.com) and MCSN (mcsnnigeria.org) do NOT publish member directories. Scraping for names was not possible. Only MCSN's aggregate count is public.",
        "The named frame oversamples major/charting artists. Rural, informal, and non-registered artists are almost certainly under-represented.",
        "Diaspora artists with Nigerian heritage (e.g. Sade Adu, Obongjayar, Afrikan Boy) are included where Wikipedia categorises them under Nigerian music. NBS should decide whether to keep or drop them for domestic-economy estimates.",
        "Non-musicians appearing on Wikipedia lists (actresses, comedians, theatre founders) have been filtered out via an explicit exclude list.",
    ]
    for offset, line in enumerate(notes, start=1):
        ws.cell(row=note_row + offset, column=1, value=f"• {line}")
        ws.merge_cells(start_row=note_row + offset, start_column=1, end_row=note_row + offset, end_column=3)
        ws.cell(row=note_row + offset, column=1).alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[note_row + offset].height = 30

    ws.column_dimensions["A"].width = 54
    ws.column_dimensions["B"].width = 20
    ws.column_dimensions["C"].width = 70

    # --- Sampled_Artists ---
    ws2 = wb.create_sheet("Sampled_Artists")
    headers = ["Artist Name", "Country", "Chartmetric ID", "Spotify ID", "YouTube ID", "Label", "Status"]
    for i, h in enumerate(headers, start=1):
        c = ws2.cell(row=1, column=i, value=h)
        c.font = header_font
        c.fill = header_fill
    for i, r in enumerate([r for r in rows if r["in_sample"] == "Y"], start=2):
        ws2.cell(row=i, column=1, value=r["artist_name"])
        ws2.cell(row=i, column=2, value=r["country"])
        ws2.cell(row=i, column=3, value=r["cm_artist_id"])
        ws2.cell(row=i, column=4, value=r["spotify_id"])
        ws2.cell(row=i, column=5, value=r["youtube_id"])
        ws2.cell(row=i, column=6, value=r["label"])
        ws2.cell(row=i, column=7, value="In sample — data delivered")
    for col, width in (("A", 30), ("B", 10), ("C", 16), ("D", 20), ("E", 20), ("F", 24), ("G", 28)):
        ws2.column_dimensions[col].width = width
    ws2.freeze_panes = "A2"

    # --- All_Known_Artists ---
    ws3 = wb.create_sheet("All_Known_Artists")
    headers3 = [
        "Artist Name", "Country", "Region (N/S)", "State / Area", "Genre Category",
        "Representative Song(s)", "In Sample (Y/N)",
        "Chartmetric ID", "Spotify ID", "YouTube ID", "Label", "Source",
    ]
    for i, h in enumerate(headers3, start=1):
        c = ws3.cell(row=1, column=i, value=h)
        c.font = header_font
        c.fill = header_fill
    for i, r in enumerate(rows, start=2):
        ws3.cell(row=i, column=1, value=r["artist_name"])
        ws3.cell(row=i, column=2, value=r["country"])
        ws3.cell(row=i, column=3, value=r["region"])
        ws3.cell(row=i, column=4, value=r["state_area"])
        ws3.cell(row=i, column=5, value=r["genre_category"])
        ws3.cell(row=i, column=6, value=r["representative_song"])
        flag = ws3.cell(row=i, column=7, value=r["in_sample"])
        flag.fill = y_fill if r["in_sample"] == "Y" else n_fill
        flag.alignment = Alignment(horizontal="center")
        ws3.cell(row=i, column=8, value=r["cm_artist_id"])
        ws3.cell(row=i, column=9, value=r["spotify_id"])
        ws3.cell(row=i, column=10, value=r["youtube_id"])
        ws3.cell(row=i, column=11, value=r["label"])
        ws3.cell(row=i, column=12, value=r["source"])
    widths = [
        (1, 30), (2, 10), (3, 12), (4, 18), (5, 20), (6, 40), (7, 16),
        (8, 16), (9, 20), (10, 20), (11, 22), (12, 46),
    ]
    for idx, width in widths:
        ws3.column_dimensions[get_column_letter(idx)].width = width
    ws3.freeze_panes = "A2"
    ws3.auto_filter.ref = f"A1:L{len(rows) + 1}"

    # --- Estimation_Workings ---
    ws4 = wb.create_sheet("Estimation_Workings")
    ws4["A1"] = "Worked example: how to gross up sample totals to population"
    ws4["A1"].font = Font(bold=True, size=13)
    ws4.merge_cells("A1:D1")

    headers4 = ["Step", "Formula", "Lower-bound (named frame)", "Upper-bound (MCSN ceiling)"]
    for i, h in enumerate(headers4, start=1):
        c = ws4.cell(row=3, column=i, value=h)
        c.font = header_font
        c.fill = header_fill

    steps = [
        ("1. Sample size", "n", sample_n, sample_n),
        ("2. Population size", "N", pop_n, mcsn),
        ("3. Coverage ratio", "n / N", f"{coverage_observed:.4f}", f"{coverage_vs_mcsn:.4f}"),
        (
            "4. Expansion factor",
            "N / n (or 1 / coverage)",
            f"{(pop_n / sample_n):.3f}",
            f"{(mcsn / sample_n):.3f}",
        ),
        (
            "5. Apply to a sample total (e.g. streams Σ)",
            "Σ_sample × (N / n)",
            "Σ_sample × " + f"{(pop_n / sample_n):.3f}",
            "Σ_sample × " + f"{(mcsn / sample_n):.3f}",
        ),
    ]
    for i, row in enumerate(steps, start=4):
        for j, val in enumerate(row, start=1):
            cell = ws4.cell(row=i, column=j, value=val)
            if j == 1:
                cell.font = label_font
    ws4["A10"] = "Usage"
    ws4["A10"].font = Font(bold=True)
    ws4["A11"] = (
        "Use the LOWER-bound when the named frame is considered a reasonable census of "
        "the commercially active population. Use the UPPER-bound when treating MCSN's 38,054 "
        "members as the outer edge of the industry (includes songwriters/publishers, not just performers). "
        "Reporting both gives NBS a defensible estimate range."
    )
    ws4.merge_cells("A11:D13")
    ws4["A11"].alignment = Alignment(wrap_text=True, vertical="top")
    for col, width in (("A", 44), ("B", 30), ("C", 34), ("D", 34)):
        ws4.column_dimensions[col].width = width

    OUT_XLSX.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT_XLSX)


def main() -> None:
    rows, stats = build_rows()
    write_csv(rows)
    write_xlsx(rows, stats)

    print(f"Sampled: {stats['sample_n']}")
    print(f"Additional named: {stats['non_sample_n']}")
    print(f"Named population total: {stats['population_n']}")
    print(f"MCSN ceiling: {stats['mcsn_members']:,}")
    print()
    print("By source (non-sampled):")
    for src, n in sorted(stats["by_source"].items(), key=lambda x: -x[1]):
        print(f"  {n:>4}  {src}")
    print()
    print("By category (non-sampled):")
    for cat, n in sorted(stats["by_category"].items(), key=lambda x: -x[1]):
        print(f"  {n:>4}  {cat}")
    print()
    print(f"Wrote: {OUT_CSV.relative_to(ROOT)}")
    print(f"Wrote: {OUT_XLSX.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
