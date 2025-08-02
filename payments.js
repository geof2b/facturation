App.Payments = (() => {
  const init = () => {
    // Écouteurs pour les 5 cases à cocher
    document
      .getElementById("filter-positive")
      .addEventListener("change", renderPaymentMatching);
    document
      .getElementById("filter-negative")
      .addEventListener("change", renderPaymentMatching);
    document
      .getElementById("filter-matched")
      .addEventListener("change", renderPaymentMatching);
    document
      .getElementById("filter-unmatched")
      .addEventListener("change", renderPaymentMatching);
    document
      .getElementById("filter-ignored")
      .addEventListener("change", renderPaymentMatching); // Nouvel écouteur

    const removeDuplicatesBtn = document.getElementById(
      "remove-duplicates-btn"
    );
    if (removeDuplicatesBtn) {
      removeDuplicatesBtn.addEventListener(
        "click",
        removeBankPaymentDuplicates
      );
    }

    const redoBtn = document.getElementById("redo-matching-btn");
    if (redoBtn) {
      redoBtn.addEventListener("click", redoMatching);
    }

    const ignoreAllBtn = document.getElementById("ignore-all-btn");
    if (ignoreAllBtn) {
      ignoreAllBtn.addEventListener("click", ignoreAllUnmatched);
    }

    const paymentArea = document.getElementById("payment-matching-area");
    if (paymentArea) {
      paymentArea.addEventListener("change", (e) => {
        if (e.target.classList.contains("nurse-matcher-select")) {
          handleMatchSelection(e.target);
        }
      });
    }

    processUnmatchedDebits();
    renderPaymentMatching();
  };

  const findNurseInLabel = (paymentLabel, nurses) => {
    const paymentLabelLower = paymentLabel.toLowerCase();
    let bestMatch = null;
    let bestMatchScore = 0;

    nurses.forEach((nurse) => {
      const lastName = (nurse.lastName || "").toLowerCase();
      const firstName = (nurse.firstName || "").toLowerCase();

      // 1. Décomposer nom et prénom en parties distinctes
      const lastNameParts = lastName
        .replace(/-/g, " ")
        .split(" ")
        .filter((p) => p.length > 1);
      const firstNameParts = firstName
        .replace(/-/g, " ")
        .split(" ")
        .filter((p) => p.length > 1);

      if (lastNameParts.length === 0 && firstNameParts.length === 0) return;

      // 2. Calculer un score basé sur les parties trouvées
      let firstNameScore = 0;
      let lastNameScore = 0;

      lastNameParts.forEach((part) => {
        if (paymentLabelLower.includes(part)) {
          lastNameScore++;
        }
      });
      firstNameParts.forEach((part) => {
        if (paymentLabelLower.includes(part)) {
          firstNameScore++;
        }
      });

      const totalScore = firstNameScore + lastNameScore;
      // On vérifie si toutes les parties du nom de famille ont été trouvées
      const allLastNamePartsFound = lastNameScore === lastNameParts.length;

      // 3. Condition de rapprochement améliorée :
      // - SOIT TOUTES les parties du NOM de famille sont trouvées (cas "TALBI")
      // - SOIT le score total est d'au moins 2 (cas "MARIE HELENE VON MOOS")
      const isAValidMatch =
        (allLastNamePartsFound && lastNameParts.length > 0) || totalScore >= 2;

      if (isAValidMatch && totalScore > bestMatchScore) {
        bestMatchScore = totalScore;
        bestMatch = nurse;
      }
    });

    return bestMatch;
  };

  const processUnmatchedDebits = () => {
    // CORRECTION : Utilise TOUTES les infirmières, y compris archivées.
    const allNurses = App.db.nurses;
    let debitsToDelete = [];
    let matchedCount = 0;

    const unmatchedDebits = App.db.bankPayments.filter(
      (p) => p.debit > 0 && p.status === "unmatched"
    );

    unmatchedDebits.forEach((payment) => {
      const foundNurse = findNurseInLabel(payment.label, allNurses); // Utilise la liste complète

      if (foundNurse) {
        payment.status = "matched";
        payment.matchedNurseId = foundNurse.id;
        matchedCount++;
      } else {
        debitsToDelete.push(payment.uniqueId);
      }
    });

    if (debitsToDelete.length > 0) {
      App.db.bankPayments = App.db.bankPayments.filter(
        (p) => !debitsToDelete.includes(p.uniqueId)
      );
    }

    if (matchedCount > 0 || debitsToDelete.length > 0) {
      console.log(
        `${matchedCount} avance(s) rapprochée(s), ${debitsToDelete.length} avance(s) non pertinente(s) supprimée(s).`
      );
      App.DB.save();
    }
  };

  const updateButtonBadges = () => {
    const duplicatesBadge = document.getElementById("duplicates-badge");
    const matchingBadge = document.getElementById("matching-badge");

    const seen = new Set();
    let duplicateCount = 0;
    App.db.bankPayments.forEach((p) => {
      const key = getPaymentUniqueKey(p);
      if (key && seen.has(key)) {
        duplicateCount++;
      } else if (key) {
        seen.add(key);
      }
    });
    duplicatesBadge.textContent = duplicateCount > 0 ? duplicateCount : "";

    let potentialMatches = 0;
    const paymentsToRecheck = App.db.bankPayments.filter(
      (p) => p.status === "unmatched"
    );

    // --- NOUVEAU LOG ---
    console.log(
      `[Badge] 'updateButtonBadges' a trouvé ${paymentsToRecheck.length} paiement(s) non-rapproché(s) à analyser.`
    );
    // --- FIN DU LOG ---

    const allNurses = App.db.nurses;

    paymentsToRecheck.forEach((payment) => {
      const foundNurse = findNurseInLabel(payment.label, allNurses);
      if (foundNurse) {
        potentialMatches++;
      }
    });
    matchingBadge.textContent = potentialMatches > 0 ? potentialMatches : "";
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

  const removeBankPaymentDuplicates = () => {
    const originalCount = App.db.bankPayments.length;
    const seen = new Set();
    const uniquePayments = [];

    for (const payment of App.db.bankPayments) {
      const key = getPaymentUniqueKey(payment);
      if (key && !seen.has(key)) {
        seen.add(key);
        uniquePayments.push(payment);
      }
    }

    const removedCount = originalCount - uniquePayments.length;

    if (removedCount > 0) {
      if (
        confirm(
          `${removedCount} doublon(s) trouvé(s). Voulez-vous les supprimer définitivement ?`
        )
      ) {
        App.db.bankPayments = uniquePayments;
        App.DB.save();
        renderPaymentMatching();
        alert(`${removedCount} doublon(s) ont été supprimé(s).`);
      }
    } else {
      alert("Aucun doublon trouvé.");
    }
  };

  const toggleIgnoreAllButton = (show) => {
    const ignoreAllBtn = document.getElementById("ignore-all-btn");
    if (ignoreAllBtn) {
      ignoreAllBtn.style.display = show ? "inline-block" : "none";
    }
  };

  const ignoreAllUnmatched = () => {
    const unmatchedPayments = App.db.bankPayments.filter(
      (p) => p.status === "unmatched" && p.credit > 0
    );
    if (unmatchedPayments.length === 0) {
      alert("Aucun paiement non rapproché à ignorer.");
      return;
    }

    unmatchedPayments.forEach((payment) => {
      payment.status = "ignored";
    });

    App.DB.save();
    renderPaymentMatching();
    alert(`${unmatchedPayments.length} paiement(s) ont été ignorés.`);
  };

  const redoMatching = () => {
    let matchesFound = 0;
    const paymentsToRecheck = App.db.bankPayments.filter(
      (p) => p.status === "unmatched"
    );

    // --- NOUVEAU LOG ---
    console.log(
      `[Action Bouton] 'redoMatching' a trouvé ${paymentsToRecheck.length} paiement(s) non-rapproché(s) à traiter.`
    );
    // --- FIN DU LOG ---

    const allNurses = App.db.nurses;

    paymentsToRecheck.forEach((payment) => {
      const foundNurse = findNurseInLabel(payment.label, allNurses);

      if (foundNurse) {
        payment.status = "matched";
        payment.matchedNurseId = foundNurse.id;
        matchesFound++;
      }
    });

    if (matchesFound > 0) {
      App.DB.save();
      renderPaymentMatching();
    }

    alert(`${matchesFound} rapprochements effectués.`);
  };

  const renderPaymentMatching = () => {
    // --- NOUVEAU LOG ---
    const totalUnmatched = App.db.bankPayments.filter(
      (p) => p.status === "unmatched"
    ).length;
    console.log(
      `[Affichage] Au début de 'renderPaymentMatching', la base de données contient ${totalUnmatched} paiement(s) non-rapproché(s).`
    );
    // --- FIN DU LOG ---

    const container = document.getElementById("payment-matching-area");
    if (!container) return;

    // ... (le reste de la fonction est inchangé)
    const showPositive = document.getElementById("filter-positive").checked;
    const showNegative = document.getElementById("filter-negative").checked;
    const showMatched = document.getElementById("filter-matched").checked;
    const showUnmatched = document.getElementById("filter-unmatched").checked;
    const showIgnored = document.getElementById("filter-ignored").checked;

    if (
      !showPositive &&
      !showNegative &&
      !showMatched &&
      !showUnmatched &&
      !showIgnored
    ) {
      container.innerHTML =
        "<p class='info-message'>Aucun filtre sélectionné.</p>";
      updateButtonBadges();
      return;
    }

    const paymentsToDisplay = App.db.bankPayments.filter((p) => {
      const isPositive = p.credit > 0;
      const isNegative = p.debit > 0;
      const isMatched = p.status === "matched";
      const isUnmatched = p.status === "unmatched";
      const isIgnored = p.status === "ignored";

      const typeFilterActive = showPositive || showNegative;
      const statusFilterActive = showMatched || showUnmatched || showIgnored;

      const typeMatch =
        !typeFilterActive ||
        (showPositive && isPositive) ||
        (showNegative && isNegative);
      const statusMatch =
        !statusFilterActive ||
        (showMatched && isMatched) ||
        (showUnmatched && isUnmatched) ||
        (showIgnored && isIgnored);

      return typeMatch && statusMatch;
    });

    paymentsToDisplay.sort(
      (a, b) => App.Utils.parseDate(b.date) - App.Utils.parseDate(a.date)
    );

    if (paymentsToDisplay.length === 0) {
      container.innerHTML =
        "<p class='info-message'>Aucun paiement à afficher selon les filtres actuels.</p>";
    } else {
      const allNurses = App.db.nurses.sort((a, b) =>
        a.lastName.localeCompare(b.lastName)
      );

      let tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Libellé</th>
              <th>Montant</th>
              <th>Assignation</th>
            </tr>
          </thead>
          <tbody>
      `;

      paymentsToDisplay.forEach((payment) => {
        const isDebit = payment.debit > 0;
        let selectedValue = "unassigned";

        if (payment.status === "matched")
          selectedValue = payment.matchedNurseId;
        else if (payment.status === "ignored") selectedValue = "ignore";

        let selectClass = "nurse-matcher-select";
        if (payment.status === "ignored") selectClass += " select-ignored";
        else if (payment.status === "matched")
          selectClass += isDebit ? " select-debit" : " select-matched";
        else selectClass += " unassigned";

        let optionsHtml = `<option value="unassigned" >--- Choisir une infirmière ---</option>`;
        optionsHtml += `<option value="ignore">Ignorer ce paiement</option>`;
        allNurses.forEach((nurse) => {
          optionsHtml += `<option value="${
            nurse.id
          }">${nurse.lastName.toUpperCase()} ${nurse.firstName}</option>`;
        });

        const finalOptions = optionsHtml.replace(
          `value="${selectedValue}"`,
          `value="${selectedValue}" selected`
        );
        const amountText = isDebit
          ? `-${App.Utils.formatNumber(payment.debit)}`
          : App.Utils.formatNumber(payment.credit);

        const displayDate = App.Utils.parseDate(payment.date);
        const dateText = displayDate
          ? displayDate.toLocaleDateString("fr-CH")
          : payment.date;

        tableHtml += `
          <tr data-payment-id="${payment.uniqueId}">
            <td>${dateText}</td>
            <td>${payment.label}</td>
            <td class="amount">${amountText}</td>
            <td>
              <select class="${selectClass}">
                ${finalOptions}
              </select>
            </td>
          </tr>
        `;
      });

      tableHtml += "</tbody></table>";
      container.innerHTML = tableHtml;
    }

    updateButtonBadges();
  };

  const handleMatchSelection = (selectElement) => {
    const selectedValue = selectElement.value;
    const row = selectElement.closest("tr");
    const paymentId = row.dataset.paymentId;

    // Approche de mise à jour plus robuste par index
    const paymentIndex = App.db.bankPayments.findIndex(
      (p) => p.uniqueId.trim() === paymentId.trim()
    );

    if (paymentIndex === -1) return;

    // On travaille sur une copie pour éviter les effets de bord
    const payment = { ...App.db.bankPayments[paymentIndex] };
    const previousNurseId = payment.matchedNurseId;

    // 1. Mettre à jour le statut du paiement
    if (selectedValue === "unassigned") {
      payment.status = "unmatched";
      payment.matchedNurseId = null;
    } else if (selectedValue === "ignore") {
      payment.status = "ignored";
      payment.matchedNurseId = null;
    } else {
      payment.status = "matched";
      payment.matchedNurseId = selectedValue;
    }

    // 2. Correction du statut de la facture associée (si applicable)
    if (
      (selectedValue === "unassigned" || selectedValue === "ignore") &&
      previousNurseId &&
      payment.credit > 0
    ) {
      const invoiceToRevert = App.db.invoices.find(
        (inv) =>
          inv.nurseId === previousNurseId &&
          inv.status === "paid" &&
          Math.abs(inv.totalDue - payment.credit) < 0.01
      );
      if (invoiceToRevert) invoiceToRevert.status = "unpaid";
    }
    if (payment.status === "matched" && payment.credit > 0) {
      const invoiceToPay = App.db.invoices.find(
        (inv) =>
          inv.nurseId === payment.matchedNurseId &&
          inv.status === "unpaid" &&
          Math.abs(inv.totalDue - payment.credit) < 0.01
      );
      if (invoiceToPay) invoiceToPay.status = "paid";
    }

    // On remplace l'ancien objet par le nouveau dans la base de données en mémoire
    App.db.bankPayments[paymentIndex] = payment;

    // 3. Proposer de mettre à jour les paiements similaires
    if (payment.status !== "unmatched") {
      const otherSimilarUnmatched = App.db.bankPayments.filter(
        (p) =>
          p.uniqueId !== payment.uniqueId &&
          p.status === "unmatched" &&
          p.label === payment.label
      );
      if (otherSimilarUnmatched.length > 0) {
        const actionText =
          payment.status === "matched" ? "rapprocher" : "ignorer";
        if (
          confirm(
            `${otherSimilarUnmatched.length} autre(s) paiement(s) avec le même libellé ont été trouvés. Voulez-vous aussi les ${actionText} ?`
          )
        ) {
          otherSimilarUnmatched.forEach((p) => {
            p.status = payment.status;
            p.matchedNurseId = payment.matchedNurseId;
          });
        }
      }
    }

    App.DB.save();
    renderPaymentMatching();
  };

  return { init };
})();
