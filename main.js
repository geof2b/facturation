document.addEventListener("DOMContentLoaded", async () => {
  // Attend que la base de données soit initialisée depuis le serveur
  await App.DB.init();

  // --- NOUVEAU : Logique de l'indicateur lumineux ---
  const statusLight = document.getElementById("server-status-light");
  if (statusLight) {
    const checkServerStatus = async () => {
      try {
        const response = await fetch("/api/status");
        if (response.ok) {
          statusLight.classList.remove("status-disconnected");
          statusLight.classList.add("status-connected");
        } else {
          throw new Error("Server not OK");
        }
      } catch (error) {
        statusLight.classList.remove("status-connected");
        statusLight.classList.add("status-disconnected");
      }
    };

    // Vérifie le statut toutes les 5 secondes
    setInterval(checkServerStatus, 5000);
    // Première vérification immédiate
    checkServerStatus();
  }
  // --- FIN de la nouvelle logique ---

  // Continue seulement si les données ont bien été chargées
  if (!App.db || !App.db.nurses) {
    return; // Arrête l'exécution si les données ne sont pas là
  }

  // Initialise les modules communs qui sont toujours nécessaires
  if (App.Utils) App.Utils.init();

  const view = document.querySelector(".view");
  if (!view) return;

  const viewId = view.id;

  const navLink = document.querySelector(`.nav-link[href*="${viewId}.html"]`);
  if (navLink) {
    document
      .querySelectorAll(".nav-link")
      .forEach((link) => link.classList.remove("active"));
    navLink.classList.add("active");
  }

  switch (viewId) {
    case "dashboard":
      if (App.Dashboard) App.Dashboard.init();
      break;
    case "invoicing":
      if (App.Import) App.Import.init();
      if (App.Invoicing) {
        App.Invoicing.init();
        App.Invoicing.renderView();
        App.Invoicing.checkForNavigation();
      }
      break;
    case "history":
      if (App.History) App.History.init();
      if (App.History) App.History.renderHistoryView();
      break;
    case "nurses":
      if (App.Import) App.Import.init();
      if (App.Nurses) App.Nurses.init();
      break;
    case "payments":
      if (App.Import) App.Import.init();
      if (App.Payments) App.Payments.init();
      break;
    case "import":
      if (App.Import) App.Import.init();
      break;
    case "settings":
      if (App.Settings) App.Settings.init();
      break;
  }
});
