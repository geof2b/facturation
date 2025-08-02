const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 4000; // Le port a été changé ici
const DB_PATH = path.join(__dirname, "db.json");

app.use(bodyParser.json({ limit: "10mb" })); // Augmenter la limite pour les grosses sauvegardes
app.use(express.static(__dirname)); // Sert les fichiers statiques (html, css, js)

// Endpoint pour vérifier le statut du serveur
app.get("/api/status", (req, res) => {
  res.status(200).send({ status: "ok" });
});

// Endpoint pour récupérer les données
app.get("/api/data", (req, res) => {
  fs.readFile(DB_PATH, "utf8", (err, data) => {
    if (err) {
      console.error("Erreur de lecture du fichier db.json:", err);
      return res
        .status(500)
        .send("Erreur serveur lors de la lecture des données.");
    }
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  });
});

// Endpoint pour sauvegarder les données
app.post("/api/data", (req, res) => {
  const dataToSave = JSON.stringify(req.body, null, 2);
  fs.writeFile(DB_PATH, dataToSave, "utf8", (err) => {
    if (err) {
      console.error("Erreur d'écriture dans le fichier db.json:", err);
      return res
        .status(500)
        .send("Erreur serveur lors de la sauvegarde des données.");
    }
    res.status(200).send({ message: "Données sauvegardées avec succès." });
  });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
  console.log("Ouvrez cette adresse dans votre navigateur.");
});
