App.Nurses = (() => {
  let nurseModal, nurseForm, ledgerModal;
  let showArchived = false;
  let currentLedgerNurseId = null;

  const getFirstWorkingDayOfNextMonth = (d) => {
    const date = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    while (date.getDay() === 6 || date.getDay() === 0) {
      // 6 = Samedi, 0 = Dimanche
      date.setDate(date.getDate() + 1);
    }
    return date;
  };

  const init = () => {
    nurseModal = document.getElementById("nurse-modal");
    nurseForm = document.getElementById("nurse-form");
    ledgerModal = document.getElementById("ledger-modal");

    document
      .getElementById("add-nurse-btn")
      .addEventListener("click", openAddNurseModal);
    document
      .getElementById("toggle-archived-btn")
      .addEventListener("click", toggleArchivedView);
    nurseModal
      .querySelector(".close-btn")
      .addEventListener("click", () => (nurseModal.style.display = "none"));
    nurseForm.addEventListener("submit", handleFormSubmit);
    document
      .getElementById("nurses-list")
      .addEventListener("click", handleListClick);

    if (ledgerModal) {
      ledgerModal
        .querySelector(".close-btn")
        .addEventListener("click", () => (ledgerModal.style.display = "none"));
      document
        .getElementById("ledger-year-selector")
        .addEventListener("change", (e) => {
          if (currentLedgerNurseId)
            showLedgerForNurse(
              currentLedgerNurseId,
              parseInt(e.target.value, 10)
            );
        });
      document
        .getElementById("print-ledger-btn")
        .addEventListener("click", printLedger);
      document
        .getElementById("add-balance-btn")
        .addEventListener("click", addOpeningBalance);
    }

    renderNursesList();
  };

  const toggleArchivedView = () => {
    showArchived = !showArchived;
    const btn = document.getElementById("toggle-archived-btn");
    const title = document.querySelector("#nurses .view-header h1");

    if (showArchived) {
      btn.textContent = "Voir les infirmières actives";
      title.textContent = "Infirmières Archivées";
    } else {
      btn.textContent = "Voir les archives";
      title.textContent = "Gestion des Infirmières";
    }
    renderNursesList();
  };

  const renderNursesList = () => {
    const listContainer = document.getElementById("nurses-list");
    if (!listContainer) return;

    const filteredNurses = App.db.nurses.filter(
      (nurse) => (nurse.isArchived || false) === showArchived
    );

    let grandTotalDue = 0;
    const currentYear = new Date().getFullYear();

    const nursesWithBalance = filteredNurses
      .map((nurse) => {
        // --- DÉBUT DE LA CORRECTION DE LA LOGIQUE DE CALCUL ---

        // Le 'balance' représente ce que l'entreprise doit à l'infirmière.
        // Un solde négatif signifie donc que l'infirmière doit de l'argent.
        const openingBalanceKey = `openingBalance${currentYear - 1}`;
        let balance = nurse[openingBalanceKey] || 0;

        // Les factures (ce que l'infirmière doit à l'entreprise) DIMINUENT le solde.
        App.db.invoices.forEach((inv) => {
          if (
            inv.nurseId === nurse.id &&
            new Date(inv.dateIssued).getFullYear() === currentYear
          ) {
            balance -= inv.totalDue;
          }
        });

        // Les paiements de l'infirmière (crédits) AUGMENTENT le solde.
        // Les avances à l'infirmière (débits) DIMINUENT le solde.
        App.db.bankPayments.forEach((p) => {
          if (
            p.matchedNurseId === nurse.id &&
            App.Utils.parseDate(p.date)?.getFullYear() === currentYear
          ) {
            balance += p.credit;
            balance -= p.debit;
          }
        });

        // Le "montant dû" est l'opposé du solde, uniquement si celui-ci est négatif.
        const amountDue = balance < 0 ? Math.abs(balance) : 0;

        grandTotalDue += amountDue;
        return { ...nurse, amountDue }; // On retourne amountDue au lieu de balance
      })
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
    // --- FIN DE LA CORRECTION ---

    listContainer.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Nom</th>
                    <th>N° Compte</th>
                    <th>Commission par Défaut</th>
                    <th>Solde Dû (${currentYear})</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${nursesWithBalance
                  .map((nurse) => {
                    const archiveButton = showArchived
                      ? `<button class="unarchive-nurse-btn" data-id="${nurse.id}">Restaurer</button>`
                      : `<button class="archive-nurse-btn" data-id="${nurse.id}">Archiver</button>`;

                    return `
                    <tr>
                        <td>${nurse.lastName.toUpperCase()} ${
                      nurse.firstName
                    }</td>
                        <td>${nurse.accountId}</td>
                        <td>${nurse.defaultCommission}%</td>
                        <td class="balance-due">${
                          // On affiche amountDue qui est toujours positif ou zéro
                          nurse.amountDue > 0
                            ? App.Utils.formatNumber(nurse.amountDue)
                            : ""
                        }</td>
                        <td>
                            <button class="ledger-nurse-btn" data-id="${
                              nurse.id
                            }">🧾 Comptes</button>
                            <button class="edit-nurse-btn" data-id="${
                              nurse.id
                            }">Modifier</button>
                            ${archiveButton}
                        </td>
                    </tr>
                `;
                  })
                  .join("")}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="3">Total Dû</td>
                    <td class="balance-due total-balance">${App.Utils.formatNumber(
                      grandTotalDue
                    )}</td>
                    <td></td>
                </tr>
            </tfoot>
        </table>`;
  };

  const openAddNurseModal = () => {
    nurseForm.reset();
    document.getElementById("nurse-id").value = "";
    document.getElementById("nurse-modal-title").innerText =
      "Ajouter une Infirmière";
    nurseModal.style.display = "block";
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const nurseId = document.getElementById("nurse-id").value;

    const formData = {
      firstName: document.getElementById("nurse-firstname").value,
      lastName: document.getElementById("nurse-lastname").value,
      accountId: document.getElementById("nurse-account-id").value,
      address: document.getElementById("nurse-address").value,
      defaultCommission: parseFloat(
        document.getElementById("nurse-commission").value
      ),
    };

    if (nurseId) {
      const index = App.db.nurses.findIndex((n) => n.id === nurseId);
      App.db.nurses[index] = { ...App.db.nurses[index], ...formData };
    } else {
      App.db.nurses.push({
        id: `nurse_${Date.now()}`,
        isArchived: false,
        ...formData,
      });
    }
    App.DB.save();
    renderNursesList();
    nurseModal.style.display = "none";
  };

  const handleListClick = (e) => {
    const target = e.target;
    const nurseId = target.dataset.id;

    if (target.classList.contains("edit-nurse-btn")) {
      const nurse = App.db.nurses.find((n) => n.id === nurseId);
      document.getElementById("nurse-id").value = nurse.id;
      document.getElementById("nurse-firstname").value = nurse.firstName;
      document.getElementById("nurse-lastname").value = nurse.lastName;
      document.getElementById("nurse-account-id").value = nurse.accountId;
      document.getElementById("nurse-address").value = nurse.address;
      document.getElementById("nurse-commission").value =
        nurse.defaultCommission;
      document.getElementById("nurse-modal-title").innerText =
        "Modifier une Infirmière";
      nurseModal.style.display = "block";
    }

    if (target.classList.contains("archive-nurse-btn")) {
      if (confirm("Êtes-vous sûr de vouloir archiver cette infirmière ?")) {
        const nurse = App.db.nurses.find((n) => n.id === nurseId);
        if (nurse) {
          nurse.isArchived = true;
          App.DB.save();
          renderNursesList();
        }
      }
    }

    if (target.classList.contains("unarchive-nurse-btn")) {
      const nurse = App.db.nurses.find((n) => n.id === nurseId);
      if (nurse) {
        nurse.isArchived = false;
        App.DB.save();
        renderNursesList();
      }
    }

    if (target.classList.contains("ledger-nurse-btn")) {
      showLedgerForNurse(nurseId);
    }
  };

  const showLedgerForNurse = (nurseId, year) => {
    currentLedgerNurseId = nurseId;
    const nurse = App.db.nurses.find((n) => n.id === nurseId);
    if (!nurse) return;

    const invoices = App.db.invoices
      .filter((inv) => inv.nurseId === nurseId)
      .map((inv) => {
        // --- DÉBUT DE LA MODIFICATION ---
        // Si la facture est manuelle, utiliser son libellé et sa date spécifiques.
        if (inv.isManual) {
          return {
            date: new Date(inv.dateIssued),
            label: inv.label,
            debit: inv.totalDue,
            credit: 0,
          };
        }
        // --- FIN DE LA MODIFICATION ---

        // Logique existante pour les factures standard
        const [invYear, invMonth] = inv.period.split("-").map(Number);
        const periodDate = new Date(invYear, invMonth - 1, 1);
        const cutoffDate = new Date("2025-07-01T12:00:00Z");
        const invoiceDate =
          periodDate < cutoffDate
            ? getFirstWorkingDayOfNextMonth(periodDate)
            : new Date(inv.dateIssued);
        return {
          date: invoiceDate,
          label: `Facture ${periodDate.toLocaleString("fr-FR", {
            month: "long",
            year: "numeric",
          })}`,
          debit: inv.totalDue,
          credit: 0,
        };
      });

    const payments = App.db.bankPayments
      .filter((p) => p.matchedNurseId === nurseId && p.credit > 0)
      .map((p) => ({
        date: App.Utils.parseDate(p.date),
        label: `Paiement - ${p.label}`,
        debit: 0,
        credit: p.credit,
      }));

    const debits = App.db.bankPayments
      .filter(
        (p) =>
          p.status === "matched" && p.matchedNurseId === nurseId && p.debit > 0
      )
      .map((p) => ({
        date: App.Utils.parseDate(p.date),
        label: `Avance/Prêt - ${p.label}`,
        debit: p.debit,
        credit: 0,
      }));

    let allEntries = [...invoices, ...payments, ...debits].filter(
      (e) => e.date instanceof Date && !isNaN(e.date)
    );

    const yearSelector = document.getElementById("ledger-year-selector");
    const availableYears = [
      ...new Set(allEntries.map((e) => e.date.getFullYear())),
    ].sort((a, b) => b - a);
    const targetYear =
      year ||
      (availableYears.length > 0
        ? availableYears[0]
        : new Date().getFullYear());

    if (!availableYears.includes(targetYear)) {
      availableYears.push(targetYear);
      availableYears.sort((a, b) => b - a);
    }

    yearSelector.innerHTML = availableYears
      .map(
        (y) =>
          `<option value="${y}" ${
            y === targetYear ? "selected" : ""
          }>${y}</option>`
      )
      .join("");
    yearSelector.dataset.nurseId = nurseId;

    let entriesForYear = allEntries
      .filter((e) => e.date.getFullYear() === targetYear)
      .sort((a, b) => a.date - b.date);

    let balance = 0;
    if (targetYear === 2025 && nurse.openingBalance2024) {
      entriesForYear.unshift({
        date: new Date("2025-01-01"),
        label: "Solde au 31.12.2024",
        debit: 0,
        credit: nurse.openingBalance2024,
      });
    }

    const tableRows = entriesForYear
      .map((entry) => {
        balance += entry.credit - entry.debit;
        return `
            <tr>
                <td>${entry.date.toLocaleDateString("fr-CH")}</td>
                <td>${entry.label}</td>
                <td class="amount debit">${
                  entry.debit > 0 ? App.Utils.formatNumber(entry.debit) : ""
                }</td>
                <td class="amount credit">${
                  entry.credit > 0 ? App.Utils.formatNumber(entry.credit) : ""
                }</td>
                <td class="amount balance">${App.Utils.formatNumber(
                  balance
                )}</td>
            </tr>
        `;
      })
      .join("");

    const detailsContainer = document.getElementById("ledger-details");
    detailsContainer.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Libellé</th>
                    <th>Facturé (Dû)</th>
                    <th>Payé</th>
                    <th>Solde</th>
                </tr>
            </thead>
            <tbody>${tableRows}</tbody>
        </table>`;

    document.getElementById(
      "ledger-modal-title"
    ).textContent = `Relevé de compte - ${nurse.lastName.toUpperCase()}`;
    document.getElementById(
      "ledger-summary"
    ).innerHTML = `<strong>Solde final pour ${targetYear}: ${App.Utils.formatNumber(
      balance
    )} CHF</strong>`;
    ledgerModal.style.display = "block";
  };

  const addOpeningBalance = () => {
    if (!currentLedgerNurseId) return;
    const nurse = App.db.nurses.find((n) => n.id === currentLedgerNurseId);
    if (!nurse) return;

    const currentBalance = nurse.openingBalance2024 || 0;
    const newBalanceStr = prompt(
      "Entrez le solde au 31.12.2024 pour cette infirmière :",
      currentBalance
    );

    if (newBalanceStr !== null) {
      const newBalance = parseFloat(newBalanceStr.replace(",", "."));
      if (!isNaN(newBalance)) {
        nurse.openingBalance2024 = newBalance;
        App.DB.save();
        showLedgerForNurse(currentLedgerNurseId, 2025);
      } else {
        alert("Veuillez entrer un montant numérique valide.");
      }
    }
  };

  const printLedger = () => {
    if (!currentLedgerNurseId) return;
    const nurse = App.db.nurses.find((n) => n.id === currentLedgerNurseId);
    const year = document.getElementById("ledger-year-selector").value;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const invoices = App.db.invoices
      .filter((inv) => inv.nurseId === currentLedgerNurseId)
      .map((inv) => {
        const [invYear, invMonth] = inv.period.split("-").map(Number);
        const periodDate = new Date(invYear, invMonth - 1, 1);
        const cutoffDate = new Date("2025-07-01T12:00:00Z");
        return {
          date:
            periodDate < cutoffDate
              ? getFirstWorkingDayOfNextMonth(periodDate)
              : new Date(inv.dateIssued),
          label: `Facture ${periodDate.toLocaleString("fr-FR", {
            month: "long",
            year: "numeric",
          })}`,
          debit: inv.totalDue,
          credit: 0,
        };
      });
    const payments = App.db.bankPayments
      .filter((p) => p.matchedNurseId === currentLedgerNurseId)
      .map((p) => ({
        date: App.Utils.parseDate(p.date),
        label: `Paiement - ${p.label}`,
        debit: 0,
        credit: p.credit,
      }));

    let allEntries = [...invoices, ...payments].filter(
      (e) => e.date instanceof Date && !isNaN(e.date)
    );
    let entriesForYear = allEntries
      .filter((e) => e.date.getFullYear() == year)
      .sort((a, b) => a.date - b.date);

    if (parseInt(year, 10) === 2025 && nurse.openingBalance2024) {
      entriesForYear.unshift({
        date: new Date("2025-01-01"),
        label: "Solde au 31.12.2024",
        debit: 0,
        credit: nurse.openingBalance2024,
      });
    }

    const head = [["Date", "Libellé", "Facturé (Dû)", "Payé", "Solde"]];
    const body = [];
    let balance = 0;

    entriesForYear.forEach((entry) => {
      balance += entry.credit - entry.debit;
      body.push([
        entry.date.toLocaleDateString("fr-CH"),
        entry.label,
        entry.debit > 0 ? App.Utils.formatNumber(entry.debit) : "",
        entry.credit > 0 ? App.Utils.formatNumber(entry.credit) : "",
        App.Utils.formatNumber(balance),
      ]);
    });

    doc.setFontSize(16);
    doc.text(
      `Relevé de compte pour ${nurse.lastName.toUpperCase()} ${
        nurse.firstName
      } - Année ${year}`,
      14,
      22
    );

    doc.autoTable({
      head: head,
      body: body,
      startY: 30,
      theme: "grid",
      headStyles: { fillColor: [0, 90, 156], halign: "center" },
      columnStyles: {
        0: { halign: "left", cellWidth: 30 },
        1: { halign: "left", cellWidth: "auto" },
        2: { halign: "right", cellWidth: 25 },
        3: { halign: "right", cellWidth: 25 },
        4: { halign: "right", cellWidth: 25 },
      },
    });

    let finalY = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(12);

    const startX = 14;
    const nonBoldPart = `Solde final pour ${year}: `;
    const boldPart = `CHF ${App.Utils.formatNumber(balance)}`;

    doc.setFont(undefined, "normal");
    doc.text(nonBoldPart, startX, finalY);

    const nonBoldWidth = doc.getTextWidth(nonBoldPart);

    doc.setFont(undefined, "bold");
    doc.text(boldPart, startX + nonBoldWidth, finalY);

    doc.save(`Releve ${nurse.lastName} - ${year}.pdf`);
  };

  return { init };
})();
