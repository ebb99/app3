// ===============================
// ENV
// ===============================
if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

console.log("ENV CHECK:", process.env.DATABASE_URL);

// ===============================
// Imports
// ===============================
const express = require("express");
const pg = require("pg");
const path = require("path");
const cron = require("node-cron");
const session = require("express-session");
const bcrypt = require("bcrypt");
const cors = require("cors");
// ===============================
// App
// ===============================
const app = express();
const PORT = process.env.PORT || 8080;

// ===============================
// Konstanten
// ===============================
const SPIELZEIT_MINUTEN = 90;
const NACHSPIELZEIT_MINUTEN = 30;

// ===============================
// Middleware
// ===============================
app.use(express.json());
app.use(express.static("public"));
app.use("/bilder", express.static("bilder"));

app.use(cors({
    origin: 'http://localhost:8080', // Ersetze dies mit der URL deines Frontends
    credentials: true, // <-- CRITICAL: Erlaubt das Senden/Empfangen von Cookies
}));


app.use(session({
    secret: process.env.SESSION_SECRET || "super-geheim",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// ===============================
// Auth Middleware (NUR API)
// ===============================
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: "Login erforderlich" });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== "admin") {
        return res.status(403).json({ error: "Nur Admin" });
    }
    next();
}

function requireTipper(req, res, next) {
    if (!req.session.user || req.session.user.role !== "tipper") {
        return res.status(403).json({ error: "Nur Tipper erlaubt" });
    }
    next();
}

// ===============================
// Datenbank
// ===============================
const isRailway =
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes("localhost");

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isRailway ? { rejectUnauthorized: false } : false

});
pool.on("connect", async (client) => {
  await client.query("SET TIME ZONE 'Europe/Berlin'");
});



pool.connect()
    .then(c => {
        c.release();
        console.log("PostgreSQL verbunden");
    })
    .catch(err => console.error("DB Fehler:", err));

// ===============================
// Cron Jobs
// ===============================
cron.schedule("* * * * *", async () => {
    try {
        await pool.query(`
            UPDATE spiele
            SET statuswort = 'live'
            WHERE statuswort = 'geplant'
              AND anstoss <= NOW()
        `);

        await pool.query(`
            UPDATE spiele
            SET statuswort = 'beendet'
            WHERE statuswort = 'live'
              AND anstoss
                + INTERVAL '${SPIELZEIT_MINUTEN} minutes'
                + INTERVAL '${NACHSPIELZEIT_MINUTEN} minutes'
                <= NOW()
        `);
    } catch (err) {
        console.error("Cron Fehler:", err);
    }
});


app.get("/api/rangliste", requireLogin, async (req, res) => {
    const result = await pool.query(`
    SELECT u.name, COALESCE(SUM(t.punkte),0) AS punkte
    FROM users u
    LEFT JOIN tips t ON u.id = t.user_id
    GROUP BY u.id
    ORDER BY punkte DESC
    `);
    res.json(result.rows);
});



// ===============================
// Session / Auth API
// ===============================
app.post("/api/login", async (req, res) => {
    const { name, password } = req.body;

    try {
        const result = await pool.query(
            "SELECT id, name, role, password FROM users WHERE name = $1",
            [name]
        );

        if (result.rowCount === 0) {
            return res.status(401).json({ error: "Login fehlgeschlagen" });
        }

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password);

        if (!valid) {
            return res.status(401).json({ error: "Login fehlgeschlagen" });
        }

        req.session.user = {
            id: user.id,
            name: user.name,
            role: user.role
        };

        res.json({ role: user.role });

    } catch (err) {
        res.status(500).json({ error: "Login-Fehler" });
    }
});

app.post("/api/logout", (req, res) => {
    req.session.destroy(() => res.json({ message: "Logout ok" }));
});

app.get("/api/session", (req, res) => {
    res.json({ user: req.session.user || null });
});


// ===============================
// Zeiten API
// ===============================
app.get("/api/zeiten", requireLogin, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, zeit FROM zeiten ORDER BY zeit"
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Zeiten laden fehlgeschlagen" });
    }
});

app.post("/api/zeiten", requireAdmin, async (req, res) => {
    const { zeit } = req.body;

    try {
        const result = await pool.query(
            "INSERT INTO zeiten (zeit) VALUES ($1) RETURNING *",
            [zeit]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Zeit speichern fehlgeschlagen" });
    }
});

app.delete("/api/zeiten/:id", requireAdmin, async (req, res) => {
    try {
        await pool.query("DELETE FROM zeiten WHERE id=$1", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Zeit löschen fehlgeschlagen" });
    }
});

// ===============================
// Vereine API
// ===============================
app.get("/api/vereine", requireLogin, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, vereinsname FROM vereine ORDER BY vereinsname"
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Vereine laden fehlgeschlagen" });
    }
});

app.post("/api/vereine", requireAdmin, async (req, res) => {
    const { vereinsname } = req.body;

    try {
        const result = await pool.query(
            "INSERT INTO vereine (vereinsname) VALUES ($1) RETURNING *",
            [vereinsname]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Verein speichern fehlgeschlagen" });
    }
});

app.delete("/api/vereine/:id", requireAdmin, async (req, res) => {
    try {
        await pool.query("DELETE FROM vereine WHERE id=$1", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Verein löschen fehlgeschlagen" });
    }
});



// ===============================
// Spiele + eigene Tipps neu
// ===============================
app.get("/api/spiele", requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const result = await pool.query(`
            SELECT
                s.id,
                s.anstoss,
                s.heimverein,
                s.gastverein,
                s.statuswort,
                t.heimtipp,
                t.gasttipp
            FROM spiele s
            LEFT JOIN tips t
              ON t.spiel_id = s.id
             AND t.user_id = $1
            ORDER BY s.anstoss DESC
        `, [userId]);

        res.json(result.rows);

    } catch (err) {
        console.error("❌ /api/spiele:", err);
        res.status(500).json({ error: "Spiele laden fehlgeschlagen" });
    }
});


app.post("/api/spiele", requireAdmin, async (req, res) => {
    const { anstoss, heimverein, gastverein, heimtore, gasttore, statuswort } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO spiele
             (anstoss, heimverein, gastverein, heimtore, gasttore, statuswort)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [anstoss, heimverein, gastverein, heimtore, gasttore, statuswort]
        );
        res.json(result.rows[0]);
    } catch {
        res.status(500).json({ error: "Spiel anlegen fehlgeschlagen" });
    }
});

app.patch("/api/spiele/:id/ergebnis", requireAdmin, async (req, res) => {
    const spielId = req.params.id;
    const { heimtore, gasttore } = req.body;

    try {
        // 1️⃣ Spiel aktualisieren
        const spielRes = await pool.query(`
            UPDATE spiele
            SET
                heimtore = $1,
                gasttore = $2,
                statuswort = 'ausgewertet'
            WHERE id = $3
            RETURNING *
        `, [heimtore, gasttore, spielId]);

        if (!spielRes.rows.length) {
            return res.status(404).json({ error: "Spiel nicht gefunden" });
        }

        // 2️⃣ Tipps auswerten
        const tips = await pool.query(`
            SELECT id, heimtipp, gasttipp
            FROM tips
            WHERE spiel_id = $1
        `, [spielId]);

   for (const t of tips.rows) {
            let punkte = 0;
            

            if (t.heimtipp === heimtore && t.gasttipp === gasttore) {
                punkte = 5;
            } else if (t.heimtipp - t.gasttipp === heimtore - gasttore) {
                punkte = 3;
            }
             else if ((t.heimtipp - t.gasttipp) * (heimtore - gasttore) > 0
            ) {
                punkte = 1;
            }
            await pool.query(`
                UPDATE tips
                SET punkte = $1
                WHERE id = $2
            `, [punkte, t.id]);
        }

        res.json({
            success: true,
            spiel: spielRes.rows[0],
            ausgewerteteTipps: tips.rows.length
        });

    } catch (err) {
        console.error("❌ Ergebnis auswerten:", err);
        res.status(500).json({ error: "Auswertung fehlgeschlagen" });
    }
});


// ===============================
// Spiel löschen (ADMIN)
// ===============================
app.delete("/api/spiele/:id", requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        // 1️⃣ Tipps zum Spiel löschen (wichtig wegen FK!)
        await pool.query(
            "DELETE FROM tips WHERE spiel_id = $1",
            [id]
        );

        // 2️⃣ Spiel löschen
        const result = await pool.query(
            "DELETE FROM spiele WHERE id = $1 RETURNING id",
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Spiel nicht gefunden" });
        }

        res.json({ ok: true, id });

    } catch (err) {
        console.error("Spiel löschen Fehler:", err);
        res.status(500).json({ error: "Spiel konnte nicht gelöscht werden" });
    }
});

app.post("/api/tips", requireLogin, requireTipper, async (req, res) => {
    const { spiel_id, heimtipp, gasttipp } = req.body;

    try {
        // Spiel laden
        const spielRes = await pool.query(
            "SELECT anstoss, statuswort FROM spiele WHERE id=$1",
            [spiel_id]
        );

        if (spielRes.rowCount === 0) {
            return res.status(404).json({ error: "Spiel nicht gefunden" });
        }

        const spiel = spielRes.rows[0];

        // Status prüfen
        if (spiel.statuswort !== "geplant") {
            return res.status(403).json({ error: "Spiel nicht mehr tippbar" });
        }

        // Zeitfenster prüfen
        if (new Date(spiel.anstoss) <= new Date()) {
            return res.status(403).json({ error: "Anstoßzeit überschritten" });
        }

        // Tipp speichern / überschreiben
        const result = await pool.query(`
            INSERT INTO tips (user_id, spiel_id, heimtipp, gasttipp)
            VALUES ($1,$2,$3,$4)
            ON CONFLICT (user_id, spiel_id)
            DO UPDATE SET
                heimtipp=$3,
                gasttipp=$4,
                updated_at=NOW()
            RETURNING *`,
            [req.session.user.id, spiel_id, heimtipp, gasttipp]
        );

        res.json(result.rows[0]);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Tippen fehlgeschlagen" });
    }
});



// ===============================
// Alle Tipps anzeigen (für alle User)
// ===============================
app.get("/api/tips", requireLogin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                t.id,
                t.spiel_id,
                t.heimtipp,
                t.gasttipp,
                t.punkte,
                t.updated_at,

                u.name AS user_name,

                s.anstoss,
                s.heimverein,
                s.gastverein,
                s.heimtore,
                s.gasttore,
                s.statuswort

            FROM tips t
            JOIN users u ON u.id = t.user_id
            JOIN spiele s ON s.id = t.spiel_id

            ORDER BY s.anstoss DESC, u.name ASC
            
        `);

        res.json(result.rows);

    } catch (err) {
        console.error("❌ /api/tips:", err);
        res.status(500).json({ error: "Tipps laden fehlgeschlagen" });
    }
});



app.get("/api/rangliste", requireLogin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                u.id,
                u.name,
                COALESCE(SUM(t.punkte), 0) AS punkte
            FROM users u
            LEFT JOIN tips t ON t.user_id = u.id
            GROUP BY u.id
            ORDER BY punkte DESC, u.name
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("❌ Rangliste:", err);
        res.status(500).json({ error: "Rangliste fehlgeschlagen" });
    }
});



// ===============================
// User API (Admin)
// ===============================
app.get("/api/users", requireAdmin, async (req, res) => {
    const result = await pool.query(
        "SELECT id, name, role FROM users ORDER BY name"
    );
    res.json(result.rows);
});

app.post("/api/users", requireAdmin, async (req, res) => {
    const { name, password, role } = req.body;

    console.log("👤 NEW USER:", req.body); // ← WICHTIG

    if (!name || !password || !role) {
        return res.status(400).json({ error: "Daten fehlen" });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
        "INSERT INTO users (name, password, role) VALUES ($1,$2,$3) RETURNING id,name,role",
        [name, hash, role]
    );

    res.json(result.rows[0]);
});


app.delete("/api/users/:id", requireAdmin, async (req, res) => {
    await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
    res.json({ success: true });
});





// ===============================
// Start
// ===============================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
