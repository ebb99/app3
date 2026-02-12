import requests
from bs4 import BeautifulSoup
import psycopg2
import re

def parse_spiel_block(text):
    # Remove URLs
    text = re.sub(r"https?://\S+", "", text)

    # Extract all integers in correct order
    numbers = re.findall(r"\b\d+\b", text)

    if len(numbers) < 3:
        print("⚠ Zu wenige Zahlen gefunden:", numbers)
        return None

    # Interpretation:
    # Example: “TeamA 2 1 TeamB 0 0 15:30”
    # TeamA tore, TeamB tore, time
    th = int(numbers[0])  # first score
    ta = int(numbers[1])  # second score
    zeit = numbers[-1]    # last number (time)

    # Remove the numbers from the text to isolate team names
    text_ohne_zahlen = re.sub(r"\b\d+\b", "", text).replace("  ", " ").strip()

    # Split at the time (remove "Beendet" etc.)
    if zeit in text_ohne_zahlen:
        heim_aus_text = text_ohne_zahlen.split(zeit)[0].strip()
    else:
        heim_aus_text = text_ohne_zahlen

    # Try to split teams by double spaces
    parts = heim_aus_text.split("  ")
    parts = [p.strip() for p in parts if p.strip()]

    if len(parts) < 2:
        print("⚠ Konnte Teams nicht trennen, Rückgabe voller Text")
        return {
            "heim": heim_aus_text,
            "aus": "",
            "th": th,
            "ta": ta,
            "zeit": zeit
        }

    heim = parts[0]
    aus = parts[1]

    return {
        "heim": heim,
        "aus": aus,
        "th": th,
        "ta": ta,
        "zeit": zeit
    }


# --- DB Verbindung ---
conn = psycopg2.connect(
    dbname="mob_test",
    user="postgres",
    password="6778",
    host="localhost",
    port=5432
)
cur = conn.cursor()

# --- Scraping ---
URL = "https://www.sportschau.de/live-und-ergebnisse/fussball/deutschland-bundesliga/se94724/2025-2026/ro262400/spieltag/md20/spiele-und-ergebnisse"
html = requests.get(URL).text

soup = BeautifulSoup(html, "html.parser")

# Beispiel – musst du durch deine Selektoren ersetzen
blocks = soup.select("article, .match, .spiele__match, .matches__row, .sc-teaser")

print("Gefundene mögliche Blöcke:", len(blocks))

for b in blocks:
    parsed = parse_spiel_block(b.get_text(" ", strip=True))

    if not parsed:
        continue

    print(parsed)

    cur.execute("""
        INSERT INTO bundesliga_ergebnisse
        (heimteam, auswaertsteam, tore_heim, tore_auswaerts, spielzeit)
        VALUES (%s, %s, %s, %s, %s)
    """, (parsed["heim"], parsed["aus"], parsed["th"], parsed["ta"], parsed["zeit"]))

conn.commit()
cur.close()
conn.close()
print("Fertig! Ergebnisse in die DB gespeichert.")
