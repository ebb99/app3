import requests
from bs4 import BeautifulSoup
import psycopg2
import os

# ----------------------------------------
# 1. PostgreSQL Verbindung (lokal)
# ----------------------------------------
DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = "deinedatenbank"
DB_USER = "deinuser"
DB_PASS = "deinpasswort"

# später auf Railway einfach ersetzen durch:
# DATABASE_URL = os.getenv("DATABASE_URL")
# conn = psycopg2.connect(DATABASE_URL)

conn = psycopg2.connect(
    host=DB_HOST,
    port=DB_PORT,
    database=DB_NAME,
    user=DB_USER,
    password=DB_PASS
)
cur = conn.cursor()

# ----------------------------------------
# 2. Tabelle anlegen (falls nicht existiert)
# ----------------------------------------
cur.execute("""
CREATE TABLE IF NOT EXISTS bundesliga_ergebnisse (
    id SERIAL PRIMARY KEY,
    heimteam TEXT,
    auswaertsteam TEXT,
    tore_heim INTEGER,
    tore_auswaerts INTEGER,
    spiel_datum TEXT,
    scraped_at TIMESTAMP DEFAULT NOW()
);
""")
conn.commit()

# ----------------------------------------
# 3. Web scraping
# ----------------------------------------

URL = "https://www.sportschau.de/live-und-ergebnisse/fussball/deutschland-bundesliga/se94724/2025-2026/ro262400/spieltag/md21/spiele-und-ergebnisse"

print("Hole Daten von:", URL)

response = requests.get(URL)
response.raise_for_status()  # falls Seite nicht geladen werden kann

soup = BeautifulSoup(response.text, "html.parser")

# Spiele stehen in "event" oder "match" ähnlichen Blöcken
spiele = soup.select(".teaser .match, .matchRow, .event, article")

print("Gefundene mögliche Spielblöcke:", len(spiele))

# ----------------------------------------
# 4. Parsing Logik (Sportschau)
# ----------------------------------------

def extract_text(el):
    return el.get_text(strip=True) if el else None

for s in spiele:
    # Teams
    heim = extract_text(s.select_one(".team--home .team__name, .team-home, .team-left"))
    auswaerts = extract_text(s.select_one(".team--away .team__name, .team-away, .team-right"))

    if not heim or not auswaerts:
        continue  # Block ist kein Spiel

    # Tore
    tore_heim = extract_text(s.select_one(".team--home .team__score, .score-home"))
    tore_auswaerts = extract_text(s.select_one(".team--away .team__score, .score-away"))

    # Falls Ergebnis "–" ist (Spiel noch nicht gespielt)
    try:
        tore_heim = int(tore_heim) if tore_heim and tore_heim.isdigit() else None
        tore_auswaerts = int(tore_auswaerts) if tore_auswaerts and tore_auswaerts.isdigit() else None
    except:
        tore_heim = None
        tore_auswaerts = None

    # Datum finden
    datum = extract_text(s.select_one(".match__date, time, .event__date"))

    print(f"{heim} vs {auswaerts} – {tore_heim}:{tore_auswaerts} ({datum})")

    # ----------------------------------------
    # 5. In Datenbank speichern
    # ----------------------------------------
    cur.execute("""
        INSERT INTO bundesliga_ergebnisse
        (heimteam, auswaertsteam, tore_heim, tore_auswaerts, spiel_datum)
        VALUES (%s, %s, %s, %s, %s)
    """, (heim, auswaerts, tore_heim, tore_auswaerts, datum))

conn.commit()
cur.close()
conn.close()

print("Fertig! Ergebnisse in die DB gespeichert.")
