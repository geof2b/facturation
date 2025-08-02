App.History = (() => {
  let sortState = { key: "displayDate", order: "desc" };
  let calendarModal, manualInvoiceModal, manualInvoiceForm;
  let calendarCurrentYear;
  let availableMonths = new Set();
  let editingInvoiceId = null;

  const getFirstWorkingDayOfNextMonth = (d) => {
    const date = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    while (date.getDay() === 6 || date.getDay() === 0) {
      date.setDate(date.getDate() + 1);
    }
    return date;
  };

  // NOUVELLE FONCTION DE VÉRIFICATION D'INTÉGRITÉ
  const runDataIntegrityCheck = () => {
    const statusEl = document.getElementById("verification-status");
    if (!statusEl) return;

    // Masquer la barre avant de commencer la vérification
    statusEl.style.display = "none";

    const knownNurseAccountIds = new Set(App.db.nurses.map((n) => n.accountId));
    const unknownAccountNos = new Set();
    App.db.transactions.forEach((t) => {
      if (t.accountNo && !knownNurseAccountIds.has(t.accountNo)) {
        unknownAccountNos.add(t.accountNo);
      }
    });

    if (unknownAccountNos.size === 0) {
      statusEl.textContent =
        "✅ Vérification : Toutes les transactions sont associées à une infirmière connue.";
      statusEl.className = "verification-ok";
      statusEl.style.display = "block"; // Rendre visible
    } else {
      const codes = [...unknownAccountNos].join(", ");
      statusEl.innerHTML = `⚠️ <strong>Infirmières Inconnues</strong> : Des transactions existent pour des codes infirmiers non enregistrés. <br>Codes concernés : <strong>${codes}</strong>`;
      statusEl.className = "verification-warning";
      statusEl.style.display = "block"; // Rendre visible
    }
  };

  const init = () => {
    calendarModal = document.getElementById("calendar-modal");
    manualInvoiceModal = document.getElementById("manual-invoice-modal");
    manualInvoiceForm = document.getElementById("manual-invoice-form");

    document
      .getElementById("history-filter-status")
      .addEventListener("change", renderHistoryView);
    document
      .getElementById("history-month-selector-btn")
      .addEventListener("click", openCalendarModal);
    document
      .getElementById("history-filter-nurse")
      .addEventListener("change", renderHistoryView);
    document
      .getElementById("history-filter-bank")
      .addEventListener("change", renderHistoryView);
    document
      .getElementById("reset-history-filters")
      .addEventListener("click", resetFilters);

    const addInvoiceBtn = document.getElementById("add-manual-invoice-btn");
    if (addInvoiceBtn)
      addInvoiceBtn.addEventListener("click", openManualInvoiceModal);

    document
      .getElementById("history-list-area")
      .addEventListener("click", (e) => {
        const sortHeader = e.target.closest(".sortable");
        const voirButton = e.target.closest(".voir-btn");
        const annulerButton = e.target.closest(".annuler-btn");

        if (sortHeader) handleSortClick(e);
        else if (voirButton) {
          const { period, nurseId, isManual, invoiceId, type } =
            voirButton.dataset;
          if (isManual === "true") {
            openManualInvoiceModalForEdit(invoiceId);
          } else {
            const openInEditMode = type !== "facture";
            navigateToInvoicing(period, nurseId, openInEditMode);
          }
        } else if (annulerButton) {
          const invoiceId = annulerButton.dataset.invoiceId;
          if (
            confirm(
              "Êtes-vous sûr de vouloir supprimer définitivement cette facture ?"
            )
          ) {
            deleteInvoice(invoiceId);
          }
        }
      });

    if (calendarModal) {
      calendarModal
        .querySelector(".close-btn")
        .addEventListener("click", closeCalendarModal);
      document
        .getElementById("prev-year-btn")
        .addEventListener("click", () => navigateYear(-1));
      document
        .getElementById("next-year-btn")
        .addEventListener("click", () => navigateYear(1));
      document
        .getElementById("calendar-grid")
        .addEventListener("click", selectMonthFromCalendar);
    }

    if (manualInvoiceModal) {
      manualInvoiceModal
        .querySelector(".close-btn")
        .addEventListener(
          "click",
          () => (manualInvoiceModal.style.display = "none")
        );
    }
    if (manualInvoiceForm) {
      manualInvoiceForm.addEventListener("submit", handleManualInvoiceSubmit);
    }
  };

  const openManualInvoiceModal = () => {
    editingInvoiceId = null;
    manualInvoiceForm.reset();
    document.getElementById("manual-invoice-title").textContent =
      "Ajouter une Facture Manuelle";

    const buttonContainer = manualInvoiceForm.querySelector(
      ".modal-form-actions"
    );
    buttonContainer.innerHTML =
      '<button type="submit">Sauvegarder la Facture</button>';

    const nurseSelect = document.getElementById("manual-invoice-nurse");
    const activeNurses = App.db.nurses
      .filter((n) => !n.isArchived)
      .sort((a, b) => a.lastName.localeCompare(b.lastName));

    nurseSelect.innerHTML =
      '<option value="">-- Choisir une infirmière --</option>';
    activeNurses.forEach((nurse) => {
      nurseSelect.innerHTML += `<option value="${
        nurse.id
      }">${nurse.lastName.toUpperCase()} ${nurse.firstName}</option>`;
    });

    document.getElementById("manual-invoice-date").value = new Date()
      .toISOString()
      .slice(0, 10);
    manualInvoiceModal.style.display = "block";
  };

  const openManualInvoiceModalForEdit = (invoiceId) => {
    const invoice = App.db.invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;

    openManualInvoiceModal();
    editingInvoiceId = invoiceId;

    document.getElementById("manual-invoice-title").textContent =
      "Modifier la Facture Manuelle";
    document.getElementById("manual-invoice-nurse").value = invoice.nurseId;
    document.getElementById("manual-invoice-date").value = new Date(
      invoice.dateIssued
    )
      .toISOString()
      .slice(0, 10);
    document.getElementById("manual-invoice-period").value = invoice.period;
    document.getElementById("manual-invoice-label").value =
      invoice.label || "Facture manuelle";
    document.getElementById("manual-invoice-amount").value = invoice.totalDue;

    const buttonContainer = manualInvoiceForm.querySelector(
      ".modal-form-actions"
    );
    buttonContainer.innerHTML = `
          <button type="button" id="delete-manual-invoice-btn">Supprimer</button>
          <button type="submit">Sauvegarder</button>
      `;
    document.getElementById("delete-manual-invoice-btn").onclick = () => {
      if (
        confirm(
          "Êtes-vous sûr de vouloir supprimer définitivement cette facture ?"
        )
      ) {
        deleteInvoice(editingInvoiceId);
        manualInvoiceModal.style.display = "none";
      }
    };

    manualInvoiceModal.style.display = "block";
  };

  const handleManualInvoiceSubmit = (e) => {
    e.preventDefault();
    const nurseId = document.getElementById("manual-invoice-nurse").value;
    const nurse = App.db.nurses.find((n) => n.id === nurseId);
    if (!nurse) return;

    const invoiceData = {
      nurseId: nurse.id,
      nurseName: `${nurse.lastName.toUpperCase()} ${nurse.firstName}`,
      period: document.getElementById("manual-invoice-period").value,
      dateIssued: new Date(
        document.getElementById("manual-invoice-date").value
      ).toISOString(),
      status: "unpaid",
      monthlyCA: 0,
      commissionRate: 0,
      commissionAmount: parseFloat(
        document.getElementById("manual-invoice-amount").value
      ),
      bonusAmount: 0,
      totalDue: parseFloat(
        document.getElementById("manual-invoice-amount").value
      ),
      totalDueManuallySet: true,
      isManual: true,
      label: document.getElementById("manual-invoice-label").value,
    };

    if (editingInvoiceId) {
      const index = App.db.invoices.findIndex(
        (inv) => inv.id === editingInvoiceId
      );
      if (index > -1) {
        App.db.invoices[index] = { ...App.db.invoices[index], ...invoiceData };
        alert("Facture mise à jour !");
      }
    } else {
      invoiceData.id = `inv_manual_${Date.now()}`;
      App.db.invoices.push(invoiceData);
      alert("Facture manuelle ajoutée !");
    }

    App.DB.save();
    manualInvoiceModal.style.display = "none";
    renderHistoryView();
  };

  const navigateToInvoicing = (period, nurseId, openInEditMode = false) => {
    sessionStorage.setItem(
      "navigateToInvoice",
      JSON.stringify({ period, nurseId, openInEditMode })
    );
    window.location.href = "invoicing.html";
  };

  const deleteInvoice = (invoiceId) => {
    const index = App.db.invoices.findIndex((inv) => inv.id === invoiceId);
    if (index > -1) {
      App.db.invoices.splice(index, 1);
      App.DB.save();
      renderHistoryView();
    }
  };

  const resetFilters = () => {
    document.getElementById("history-filter-status").value = "all";
    document.getElementById("history-filter-month").value = "";
    document
      .getElementById("history-month-selector-btn")
      .querySelector("span").textContent = "Tous les mois";
    document.getElementById("history-filter-nurse").value = "all";
    document.getElementById("history-filter-bank").checked = false;
    sortState = { key: "displayDate", order: "desc" };
    renderHistoryView();
  };

  const getAvailableMonths = () => {
    availableMonths.clear();
    const allPaymentMonths = new Set();
    const allTransactionDates = [];

    App.db.invoices.forEach((inv) => allPaymentMonths.add(inv.period));
    App.db.bankPayments.forEach((p) => {
      const d = App.Utils.parseDate(p.date);
      if (d)
        allPaymentMonths.add(
          `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`
        );
    });
    App.db.transactions.forEach((t) => {
      const d = App.Utils.parseDate(t.paymentDate);
      if (d) {
        allTransactionDates.push(d);
        allPaymentMonths.add(
          `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`
        );
      }
    });

    if (allTransactionDates.length > 0) {
      const latestDate = new Date(Math.max.apply(null, allTransactionDates));
      if (latestDate.getDate() < 20) {
        const latestMonthKey = `${latestDate.getFullYear()}-${(
          latestDate.getMonth() + 1
        )
          .toString()
          .padStart(2, "0")}`;
        allPaymentMonths.delete(latestMonthKey);
      }
    }

    availableMonths = allPaymentMonths;
    const latestPeriod =
      [...availableMonths].sort().pop() || new Date().toISOString().slice(0, 7);
    calendarCurrentYear =
      parseInt(latestPeriod.substring(0, 4), 10) || new Date().getFullYear();
  };

  const openCalendarModal = () => {
    getAvailableMonths();
    renderCalendar(calendarCurrentYear);
    calendarModal.style.display = "block";
  };

  const closeCalendarModal = () => (calendarModal.style.display = "none");
  const navigateYear = (direction) => {
    calendarCurrentYear += direction;
    renderCalendar(calendarCurrentYear);
  };

  const renderCalendar = (year) => {
    document.getElementById("calendar-year-display").textContent = year;
    const grid = document.getElementById("calendar-grid");
    grid.innerHTML = "";
    const months = [
      "Jan",
      "Fév",
      "Mar",
      "Avr",
      "Mai",
      "Juin",
      "Juil",
      "Août",
      "Sep",
      "Oct",
      "Nov",
      "Déc",
    ];
    for (let i = 0; i < 12; i++) {
      const monthStr = `${year}-${(i + 1).toString().padStart(2, "0")}`;
      const monthEl = document.createElement("div");
      monthEl.textContent = months[i];
      monthEl.classList.add("calendar-month");
      if (availableMonths.has(monthStr)) {
        monthEl.classList.add("enabled");
        monthEl.dataset.month = monthStr;
      }
      grid.appendChild(monthEl);
    }
  };

  const selectMonthFromCalendar = (e) => {
    if (e.target.classList.contains("enabled")) {
      const selectedMonth = e.target.dataset.month;
      const [year, monthNum] = selectedMonth.split("-");
      const displayDate = new Date(year, monthNum - 1);
      const displayText = displayDate.toLocaleString("fr-FR", {
        month: "long",
        year: "numeric",
      });
      document.getElementById("history-filter-month").value = selectedMonth;
      document
        .getElementById("history-month-selector-btn")
        .querySelector("span").textContent =
        displayText.charAt(0).toUpperCase() + displayText.slice(1);
      closeCalendarModal();
      renderHistoryView();
    }
  };

  const updateSortIndicators = () => {
    document.querySelectorAll("#history-list-area .sortable").forEach((th) => {
      th.classList.remove("sorted", "sort-asc", "sort-desc");
      if (th.dataset.sort === sortState.key) {
        th.classList.add("sorted", `sort-${sortState.order}`);
      }
    });
  };

  const renderHistoryView = () => {
    runDataIntegrityCheck();

    // --- Logique améliorée pour "À facturer" ---
    const invoicedTransactionRefs = new Set();
    App.db.invoices.forEach((invoice) => {
      if (!invoice.isManual && invoice.transactions) {
        invoice.transactions.forEach((tx) => {
          if (tx.included) invoicedTransactionRefs.add(tx.reference);
        });
      }
    });

    let incompleteMonthKey = null;
    const allTransactionDates = App.db.transactions
      .map((t) => App.Utils.parseDate(t.paymentDate))
      .filter((d) => d);
    if (allTransactionDates.length > 0) {
      const latestDate = new Date(Math.max.apply(null, allTransactionDates));
      if (latestDate.getDate() < 20) {
        incompleteMonthKey = `${latestDate.getFullYear()}-${(
          latestDate.getMonth() + 1
        )
          .toString()
          .padStart(2, "0")}`;
      }
    }

    const potentialInvoices = {};
    App.db.transactions.forEach((t) => {
      if (invoicedTransactionRefs.has(t.reference)) return;
      if (
        !t.debtor ||
        !t.patient ||
        t.debtor.toLowerCase() === t.patient.toLowerCase()
      )
        return;
      const paymentDate = App.Utils.parseDate(t.paymentDate);
      if (!paymentDate) return;
      const periodKey = `${paymentDate.getFullYear()}-${(
        paymentDate.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}`;
      if (periodKey === incompleteMonthKey) return;
      const nurse = App.db.nurses.find((n) => n.accountId === t.accountNo);
      if (!nurse) return;
      const key = `${nurse.id}-${periodKey}`;
      if (!potentialInvoices[key]) {
        potentialInvoices[key] = {
          nurse,
          ca: 0,
          year: paymentDate.getFullYear(),
          month: (paymentDate.getMonth() + 1).toString().padStart(2, "0"),
        };
      }
      potentialInvoices[key].ca += t.amount;
    });

    const pendingData = Object.values(potentialInvoices).map((p) => ({
      type: "a-facturer",
      period: `${p.year}-${p.month}`,
      nurseName: `${p.nurse.lastName.toUpperCase()} ${p.nurse.firstName}`,
      nurseId: p.nurse.id,
      montant: App.Utils.roundToFiveCents(
        p.ca * (p.nurse.defaultCommission / 100)
      ),
      date: new Date(p.year, parseInt(p.month, 10) - 1, 1),
      displayDate: null,
      actions: true,
    }));

    const statusFilter = document.getElementById("history-filter-status").value;

    const historyData = App.db.invoices.map((inv) => {
      // --- DÉBUT DE LA MODIFICATION ---
      if (inv.isManual) {
        return {
          id: inv.id,
          isManual: true,
          type: "facture",
          period: inv.period,
          nurseName: inv.label, // Utilise le libellé personnalisé
          nurseId: inv.nurseId,
          montant: inv.totalDue,
          date: new Date(inv.period + "-01T12:00:00Z"), // Date de période pour le filtre
          displayDate: new Date(inv.dateIssued), // Date d'émission pour l'affichage
          actions: true,
        };
      }
      // --- FIN DE LA MODIFICATION ---

      // Logique existante pour les factures standard
      const [invYear, invMonth] = inv.period.split("-").map(Number);
      const periodDate = new Date(invYear, invMonth - 1, 1);
      const cutoffDate = new Date("2025-07-01T12:00:00Z");
      const displayDate =
        periodDate < cutoffDate
          ? getFirstWorkingDayOfNextMonth(periodDate)
          : new Date(inv.dateIssued);
      return {
        id: inv.id,
        isManual: inv.isManual || false,
        type: "facture",
        period: inv.period,
        nurseName: inv.nurseName,
        nurseId: inv.nurseId,
        montant: inv.totalDue,
        date: periodDate,
        displayDate: displayDate,
        actions: true,
      };
    });

    const paymentData = App.db.bankPayments
      .filter((p) => p.credit > 0 && p.status === "matched" && p.matchedNurseId)
      .map((p) => {
        const nurse = App.db.nurses.find((n) => n.id === p.matchedNurseId);
        return {
          type: "paiement",
          nurseName: nurse
            ? `${nurse.lastName.toUpperCase()} ${nurse.firstName} (Paiement)`
            : p.label,
          nurseId: p.matchedNurseId,
          montant: -p.credit,
          date: App.Utils.parseDate(p.date),
          displayDate: App.Utils.parseDate(p.date),
          period: null,
          actions: false,
          label: p.label,
        };
      });

    let baseData = [];
    if (statusFilter === "all") baseData = [...historyData, ...pendingData];
    else if (statusFilter === "facture") baseData = historyData;
    else if (statusFilter === "a-facturer") baseData = pendingData;
    if (document.getElementById("history-filter-bank").checked) {
      baseData.push(...paymentData);
    }

    const monthFilter = document.getElementById("history-filter-month").value;
    const nurseFilter = document.getElementById("history-filter-nurse").value;

    let finalData = baseData;
    if (nurseFilter !== "all")
      finalData = finalData.filter((item) => item.nurseId === nurseFilter);
    if (monthFilter) {
      const [year, month] = monthFilter.split("-").map(Number);
      finalData = finalData.filter((item) => {
        const itemDate = item.date;
        return (
          itemDate &&
          itemDate.getFullYear() === year &&
          itemDate.getMonth() + 1 === month
        );
      });
    }

    finalData.sort((a, b) => {
      const key = sortState.key;
      const order = sortState.order;
      let valA, valB;

      switch (key) {
        case "displayDate":
          valA = a.displayDate || new Date(0);
          valB = b.displayDate || new Date(0);
          return order === "asc" ? valA - valB : valB - valA;
        case "period":
          valA = a.date || new Date(0);
          valB = b.date || new Date(0);
          return order === "asc" ? valA - valB : valB - valA;
        case "montant":
          valA = parseFloat(a.montant) || 0;
          valB = parseFloat(b.montant) || 0;
          return order === "asc" ? valA - valB : valB - valA;
        default:
          valA = String(a[key] || "").toLowerCase();
          valB = String(b[key] || "").toLowerCase();
          if (valA < valB) return order === "asc" ? -1 : 1;
          if (valA > valB) return order === "asc" ? 1 : -1;
          return 0;
      }
    });

    const listContainer = document.getElementById("history-list-area");
    if (finalData.length === 0) {
      listContainer.innerHTML =
        "<p style='text-align:center; color:#666; padding: 40px 0;'>Aucune donnée à afficher.</p>";
    } else {
      const totalMontant = finalData.reduce(
        (sum, item) => sum + (item.montant || 0),
        0
      );
      listContainer.innerHTML = `
        <table>
          <thead><tr>
            <th class="sortable" data-sort="displayDate">Date Émission</th>
            <th class="sortable" data-sort="period">Mois de Paiement</th>
            <th class="sortable" data-sort="nurseName">Infirmière / Libellé</th>
            <th class="sortable" data-sort="montant">Montant Comm.</th>
            <th class="sortable" data-sort="type">Statut</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
          ${finalData
            .map((item) => {
              let statusText, statusClass;
              switch (item.type) {
                case "facture":
                  statusText = "Facturé";
                  statusClass = "facture";
                  break;
                case "paiement":
                  statusText = "Paiement";
                  statusClass = "paiement";
                  break;
                default:
                  statusText = "À facturer";
                  statusClass = "a-facturer";
              }
              let actionButtons = "";
              if (item.actions) {
                actionButtons += `<button style="padding: 4px 10px;" class="voir-btn" 
                                    data-period="${item.period}" 
                                    data-nurse-id="${item.nurseId}" 
                                    data-is-manual="${item.isManual || false}" 
                                    data-type="${item.type}"
                                    data-invoice-id="${item.id}">Voir</button>`;
                if (item.type === "facture" && !item.isManual) {
                  actionButtons += `<button style="padding: 4px 10px;" class="annuler-btn" data-invoice-id="${item.id}">Annuler</button>`;
                }
              }
              const dateText = item.displayDate
                ? item.displayDate.toLocaleDateString("fr-CH")
                : "N/A";
              const paymentMonthText = item.period
                ? new Date(item.period + "-01T12:00:00Z").toLocaleString(
                    "fr-FR",
                    {
                      month: "long",
                      year: "numeric",
                    }
                  )
                : "N/A";
              return `<tr>
                <td>${dateText}</td>
                <td>${paymentMonthText}</td>
                <td>${item.nurseName}</td>
                <td>${App.Utils.formatNumber(item.montant)}</td>
                <td><span class="status status-${statusClass}">${statusText}</span></td>
                <td class="action-buttons">${actionButtons}</td>
              </tr>`;
            })
            .join("")}
          </tbody>
          <tfoot><tr>
              <td colspan="3">Total</td>
              <td>${App.Utils.formatNumber(totalMontant)}</td>
              <td colspan="2"></td>
          </tr></tfoot>
        </table>`;
    }
    updateSortIndicators();
    populateNurseFilter();
  };

  const handleSortClick = (e) => {
    const target = e.target.closest(".sortable");
    if (target) {
      const sortKey = target.dataset.sort;
      if (sortState.key === sortKey) {
        sortState.order = sortState.order === "asc" ? "desc" : "asc";
      } else {
        sortState.key = sortKey;
        sortState.order = "desc";
      }
      renderHistoryView();
    }
  };

  const populateNurseFilter = () => {
    const select = document.getElementById("history-filter-nurse");
    if (!select) return;
    const currentValue = select.value;
    const allNursesInvolved = new Set(
      App.db.invoices.map((inv) => inv.nurseId)
    );
    App.db.transactions.forEach((t) => {
      const nurse = App.db.nurses.find((n) => n.accountId === t.accountNo);
      if (nurse) allNursesInvolved.add(nurse.id);
    });

    const nurses = App.db.nurses
      .filter((n) => allNursesInvolved.has(n.id))
      .sort((a, b) => a.lastName.localeCompare(b.lastName));

    select.innerHTML = '<option value="all">Toutes les infirmières</option>';
    nurses.forEach((nurse) => {
      const option = document.createElement("option");
      option.value = nurse.id;
      option.textContent = `${nurse.lastName.toUpperCase()} ${nurse.firstName}`;
      select.appendChild(option);
    });
    select.value = currentValue;
  };

  return { init, renderHistoryView };
})();
