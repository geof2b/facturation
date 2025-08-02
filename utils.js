App.Utils = (() => {
  const roundToFiveCents = (value) => Math.round(value * 20) / 20;

  const parseDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== "string") return null;
    const cleanedDateStr = dateStr.trim();
    const parts = cleanedDateStr.split(".");
    if (parts.length !== 3) return null;

    let year = parseInt(parts[2], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[0], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

    // Gère les années à deux chiffres (ex: "24" devient 2024)
    if (parts[2].length === 2 && year >= 0 && year < 100) {
      year += 2000;
    }

    if (year < 1900 || year > 2100) return null;

    return new Date(year, month, day);
  };

  const cleanString = (str) => {
    if (typeof str !== "string") return "";
    return str.trim().replace(/\r/g, "");
  };

  const detectDelimiter = (text) => {
    const firstLine = text.split("\n")[0];
    const delimiters = [";", "\t", ","];
    let maxCount = 0;
    let detectedDelimiter = ";";
    delimiters.forEach((delimiter) => {
      const count = firstLine.split(delimiter).length;
      if (count > maxCount) {
        maxCount = count;
        detectedDelimiter = delimiter;
      }
    });
    return detectedDelimiter;
  };

  const formatNumber = (num) => {
    if (typeof num !== "number") return num;
    let numStr = num.toFixed(2);
    let parts = numStr.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
    return parts.join(".");
  };

  // **MODIFICATION**: Fonction restaurée
  const updateDataDateRange = () => {
    const display = document.getElementById("data-range-display");
    if (!display) return; // Sécurité si l'élément n'est pas sur la page
    if (!App.db.transactions || App.db.transactions.length === 0) {
      display.textContent = "Base de données : Aucune transaction chargée.";
      return;
    }
    const dates = App.db.transactions
      .map((t) => parseDate(t.paymentDate))
      .filter((d) => d && !isNaN(d));
    if (dates.length === 0) {
      display.textContent = "Base de données : Aucune date de paiement valide.";
      return;
    }
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    display.textContent = `Données : du ${minDate.toLocaleDateString(
      "fr-CH"
    )} au ${maxDate.toLocaleDateString("fr-CH")} `;
  };

  const init = () => {
    // Expose toutes les fonctions utilitaires à l'objet global App.Utils
    App.Utils.roundToFiveCents = roundToFiveCents;
    App.Utils.parseDate = parseDate;
    App.Utils.cleanString = cleanString;
    App.Utils.detectDelimiter = detectDelimiter;
    App.Utils.formatNumber = formatNumber;
    App.Utils.updateDataDateRange = updateDataDateRange; // **MODIFICATION**: Fonction exposée
  };

  return { init };
})();
