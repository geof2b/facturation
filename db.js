var App = {
  db: {},
};

App.DB = (() => {
  // La fonction init est maintenant asynchrone pour attendre les données du serveur
  const init = async () => {
    try {
      const response = await fetch("/api/data");
      if (!response.ok) {
        throw new Error("Impossible de charger les données depuis le serveur.");
      }
      App.db = await response.json();
      console.log("Données chargées avec succès depuis le serveur.");
    } catch (error) {
      console.error(error);
      alert(
        "ERREUR : Impossible de se connecter au serveur. Assurez-vous qu'il est bien démarré et rechargez la page."
      );
      // Initialise une base de données vide pour éviter les erreurs
      App.db = {
        nurses: [],
        transactions: [],
        invoices: [],
        bankPayments: [],
        settings: {},
      };
    }
  };

  // La fonction save envoie les données au serveur
  const save = async () => {
    try {
      await fetch("/api/data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(App.db),
      });
    } catch (error) {
      console.error("Erreur de sauvegarde:", error);
      alert(
        "ERREUR : La sauvegarde des données a échoué. Vérifiez la connexion au serveur."
      );
    }
  };

  // Note : init() est maintenant appelé dans main.js après le chargement de la page
  return { init, save };
})();
