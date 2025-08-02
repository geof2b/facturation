App.Import = (() => {
  const init = () => {
    const medionlineBtn = document.getElementById("import-medionline-btn");
    if (medionlineBtn)
      medionlineBtn.addEventListener("click", () =>
        document.getElementById("medionline-file-input").click()
      );

    const nursesBtn = document.getElementById("import-nurses-btn");
    if (nursesBtn)
      nursesBtn.addEventListener("click", () =>
        document.getElementById("nurses-file-input").click()
      );

    const bankBtn = document.getElementById("import-bank-btn");
    if (bankBtn)
      bankBtn.addEventListener("click", () =>
        document.getElementById("bank-file-input").click()
      );

    const medionlineInput = document.getElementById("medionline-file-input");
    if (medionlineInput)
      medionlineInput.addEventListener("change", importMedionline);

    const nursesInput = document.getElementById("nurses-file-input");
    if (nursesInput) nursesInput.addEventListener("change", importNurses);

    const bankInput = document.getElementById("bank-file-input");
    if (bankInput) bankInput.addEventListener("change", importBank);
  };

  const importMedionline = () => {
    const fileInput = document.getElementById("medionline-file-input");
    if (fileInput.files.length === 0) {
      alert("Veuillez sélectionner un fichier Medionline.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const fileContent = e.target.result;
      const delimiter = ";";
      let lines = fileContent.split("\n");

      // 1. Détection de la ligne d'en-tête
      let headerLineIndex = -1;
      const requiredHeaders = ["Référence CDM", "No de Compte", "Solde"];
      if (lines[0] && requiredHeaders.every((h) => lines[0].includes(h))) {
        headerLineIndex = 0;
      } else if (
        lines[1] &&
        requiredHeaders.every((h) => lines[1].includes(h))
      ) {
        headerLineIndex = 1;
      }

      if (headerLineIndex === -1) {
        alert(
          "Impossible de trouver la ligne d'en-tête valide dans le fichier CSV."
        );
        return;
      }

      const header = lines[headerLineIndex]
        .replace(/"/g, "")
        .split(delimiter)
        .map((h) => h.trim());
      const dataLines = lines.slice(headerLineIndex + 1);

      // 2. Mappage dynamique des colonnes
      const colMap = {
        ref: header.indexOf("Référence CDM"),
        account: header.indexOf("No de Compte"),
        debtor: header.indexOf("Débiteurs"),
        patient: header.indexOf("Patient"),
        start: header.indexOf("Début traitement"),
        end: header.indexOf("Fin traitement"),
        paymentDate: header.indexOf("Dernier Pmt/annul."),
        amount: header.indexOf("Montant"),
        status: header.indexOf("Solde") + 1,
      };

      if (colMap.ref === -1 || colMap.account === -1 || colMap.status === 0) {
        alert(
          "Certaines colonnes requises (Référence CDM, No de Compte, Solde) sont manquantes."
        );
        return;
      }

      let newTransactions = [];
      let duplicateCount = 0;
      let skippedCount = 0;

      dataLines.forEach((line) => {
        if (!line.trim()) return;
        const columns = line.replace(/"/g, "").split(delimiter);

        // 3. Vérification du statut "P"
        const status = App.Utils.cleanString(columns[colMap.status]);
        if (status.toUpperCase() !== "P") {
          skippedCount++;
          return;
        }

        const transaction = {
          reference: App.Utils.cleanString(columns[colMap.ref]),
          accountNo: App.Utils.cleanString(columns[colMap.account]),
          debtor: App.Utils.cleanString(columns[colMap.debtor]),
          patient: App.Utils.cleanString(columns[colMap.patient]),
          treatmentStart: App.Utils.cleanString(columns[colMap.start]),
          treatmentEnd: App.Utils.cleanString(columns[colMap.end]),
          paymentDate: App.Utils.cleanString(columns[colMap.paymentDate]),
          amount: parseFloat(columns[colMap.amount]?.replace(",", ".")) || 0,
          status: status,
        };

        // 4. Gestion des duplicata
        if (
          transaction.reference &&
          !App.db.transactions.some(
            (t) => t.reference === transaction.reference
          )
        ) {
          newTransactions.push(transaction);
        } else {
          if (transaction.reference) duplicateCount++;
        }
      });

      let message;
      if (newTransactions.length > 0) {
        let minDate = null;
        let maxDate = null;

        newTransactions.forEach((t) => {
          const pDate = App.Utils.parseDate(t.paymentDate);
          if (pDate) {
            if (!minDate || pDate < minDate) minDate = pDate;
            if (!maxDate || pDate > maxDate) maxDate = pDate;
          }
        });

        App.db.transactions.push(...newTransactions);

        const options = { day: "2-digit", month: "2-digit", year: "numeric" };
        const periodString =
          minDate && maxDate
            ? `Période des paiements : du ${minDate.toLocaleDateString(
                "fr-CH",
                options
              )} au ${maxDate.toLocaleDateString("fr-CH", options)}.`
            : "Période non déterminée.";

        message = [
          `✅ ${newTransactions.length} nouvelles transactions importées.`,
          `🗓️ ${periodString}`,
          "👍 Confirmation : Toutes les transactions importées avaient bien le statut 'Payé' (P).",
          `\nℹ️ ${duplicateCount} doublons et ${skippedCount} lignes non payées ont été ignorés.`,
        ].join("\n");
      } else {
        message = `Aucune nouvelle transaction importée.\nℹ️ ${duplicateCount} doublons et ${skippedCount} lignes non payées ont été ignorés.`;
      }

      App.DB.save();
      App.Utils.updateDataDateRange?.();
      alert(message);
      fileInput.value = "";

      if (typeof App.Invoicing?.renderView === "function") {
        App.Invoicing.renderView();
      }
    };
    reader.readAsText(fileInput.files[0], "ISO-8859-1");
  };

  const importNurses = () => {
    const fileInput = document.getElementById("nurses-file-input");
    if (fileInput.files.length === 0) {
      alert("Veuillez sélectionner un fichier d'infirmières.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const fileContent = e.target.result;
      const delimiter = App.Utils.detectDelimiter(fileContent);
      const lines = fileContent.split("\n").slice(1);
      let newCount = 0;
      lines.forEach((line) => {
        const columns = line.replace(/"/g, "").split(delimiter);
        if (columns.length < 7) return;

        let commissionStr = App.Utils.cleanString(columns[6]);
        let commission = 15;
        if (commissionStr) {
          if (commissionStr.includes("%")) {
            commission = parseFloat(commissionStr.replace("%", "")) || 15;
          } else {
            commission =
              parseFloat(commissionStr.replace(",", ".")) * 100 || 15;
          }
        }

        const nurseData = {
          id: `nurse_${Date.now()}_${Math.random()}`,
          accountId: App.Utils.cleanString(columns[0]),
          lastName: App.Utils.cleanString(columns[1]),
          firstName: App.Utils.cleanString(columns[2]),
          titre: App.Utils.cleanString(columns[3]),
          rue: App.Utils.cleanString(columns[4]),
          ville: App.Utils.cleanString(columns[5]),
          defaultCommission: commission,
          address: `${App.Utils.cleanString(
            columns[3]
          )}\n${App.Utils.cleanString(columns[2])} ${App.Utils.cleanString(
            columns[1]
          )}\n${App.Utils.cleanString(columns[4])}\n${App.Utils.cleanString(
            columns[5]
          )}`,
        };

        if (
          nurseData.accountId &&
          !App.db.nurses.some((n) => n.accountId === nurseData.accountId)
        ) {
          App.db.nurses.push(nurseData);
          newCount++;
        }
      });
      App.DB.save();
      alert(`${newCount} nouvelles infirmières importées.`);
      fileInput.value = "";
    };
    reader.readAsText(fileInput.files[0], "ISO-8859-1");
  };

  const getPaymentUniqueKey = (payment) => {
    const date = App.Utils.parseDate(payment.date);
    if (!date) return null;
    const dateString = `${date.getFullYear()}-${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
    const amount = payment.credit > 0 ? payment.credit : payment.debit;
    return `${dateString}_${payment.label.trim()}_${amount.toFixed(2)}`;
  };

  const importBank = () => {
    const fileInput = document.getElementById("bank-file-input");
    if (fileInput.files.length === 0) {
      alert("Veuillez sélectionner un fichier de la banque.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const fileContent = e.target.result;
      const delimiter = ";";
      const lines = fileContent.trim().split("\n");

      let headerIndex = -1;
      for (let i = 0; i < 20 && i < lines.length; i++) {
        if (lines[i].startsWith("Date;Libellé;Montant")) {
          headerIndex = i;
          break;
        }
      }

      if (headerIndex === -1) {
        alert(
          "En-tête du tableau non trouvé (Date;Libellé;Montant) dans les 20 premières lignes."
        );
        return;
      }

      const dataLines = lines.slice(headerIndex + 1);
      let newCount = 0;
      let duplicateCount = 0;

      const existingPaymentKeys = new Set(
        App.db.bankPayments.map(getPaymentUniqueKey).filter((k) => k)
      );

      dataLines.forEach((line) => {
        const normalizedLine = line.replace(/"/g, "").trim();
        const columns = normalizedLine.split(delimiter);

        if (columns.length < 3) return;

        const amount = parseFloat(columns[2].replace("'", "")) || 0;

        const paymentData = {
          date: columns[0].trim(),
          label: columns[1].trim(),
          credit: amount > 0 ? amount : 0,
          debit: amount < 0 ? Math.abs(amount) : 0,
        };

        const key = getPaymentUniqueKey(paymentData);

        if (key && !existingPaymentKeys.has(key)) {
          App.db.bankPayments.push({
            ...paymentData,
            uniqueId: normalizedLine, // Gardons l'original pour l'ID
            status: "unmatched",
          });
          existingPaymentKeys.add(key);
          newCount++;
        } else {
          duplicateCount++;
        }
      });
      App.DB.save();
      alert(
        `${newCount} nouveaux paiements importés. ${duplicateCount} doublons ignorés.`
      );
      fileInput.value = "";

      if (App.Payments && typeof App.Payments.init === "function") {
        App.Payments.init();
      }
    };
    reader.readAsText(fileInput.files[0], "ISO-8859-1");
  };

  return { init };
})();
