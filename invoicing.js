App.Invoicing = (() => {
  let currentInvoiceData = [];
  let selectedMonth = null;
  let availableMonths = new Set();
  let calendarCurrentYear = new Date().getFullYear();
  let selectedNurseIndex = -1;

  const getFirstWorkingDayOfNextMonth = (paymentDate) => {
    const date = new Date(
      paymentDate.getFullYear(),
      paymentDate.getMonth() + 1,
      1
    );
    while (date.getDay() === 6 || date.getDay() === 0) {
      // 6 = Samedi, 0 = Dimanche
      date.setDate(date.getDate() + 1);
    }
    return date;
  };

  const setPanelHeights = () => {
    const layoutContainer = document.getElementById(
      "invoicing-layout-container"
    );
    if (!layoutContainer) return;
    const topOffset = layoutContainer.getBoundingClientRect().top;
    layoutContainer.style.height = `${window.innerHeight - topOffset - 30}px`;
  };

  const init = () => {
    const calendarModal = document.getElementById("calendar-modal");
    document
      .getElementById("change-month-btn")
      .addEventListener("click", openCalendarModal);
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

    document
      .getElementById("invoice-preview-area")
      .addEventListener("input", handleTableInput);
    document
      .getElementById("invoice-preview-area")
      .addEventListener("change", handleTableChange);
    document
      .getElementById("invoice-preview-area")
      .addEventListener("click", handleInvoiceActionClick);
    document
      .getElementById("invoice-nurse-list-area")
      .addEventListener("click", handleNurseListClick);

    window.addEventListener("resize", setPanelHeights);
  };

  const checkForNavigation = () => {
    const navigationData = sessionStorage.getItem("navigateToInvoice");
    if (navigationData) {
      sessionStorage.removeItem("navigateToInvoice");
      const { period, nurseId, openInEditMode } = JSON.parse(navigationData);
      selectedMonth = period;
      const [year, monthNum] = selectedMonth.split("-");
      calendarCurrentYear = parseInt(year, 10);
      const date = new Date(year, monthNum - 1);
      const displaytext = date.toLocaleString("fr-FR", {
        month: "long",
        year: "numeric",
      });
      document.getElementById("change-month-btn").textContent =
        displaytext.charAt(0).toUpperCase() + displaytext.slice(1);

      generateInvoiceData();

      const nurseIndex = currentInvoiceData.findIndex(
        (data) => data.nurseId === nurseId
      );
      if (nurseIndex > -1) {
        selectedNurseIndex = nurseIndex;
        if (openInEditMode && currentInvoiceData[nurseIndex].status !== "new") {
          currentInvoiceData[nurseIndex].status = "new";
        }
        renderInvoicePreviewForNurse(nurseIndex);
        renderNurseList();
      }
    }
  };

  const getAvailableMonths = () => {
    availableMonths.clear();
    const allMonthsWithTransactions = new Set();
    const allTransactionDates = [];

    App.db.transactions.forEach((t) => {
      const d = App.Utils.parseDate(t.paymentDate);
      if (d) {
        allTransactionDates.push(d);
        const key = `${d.getFullYear()}-${(d.getMonth() + 1)
          .toString()
          .padStart(2, "0")}`;
        allMonthsWithTransactions.add(key);
      }
    });

    allMonthsWithTransactions.forEach((monthKey) => {
      const [year, month] = monthKey.split("-");
      const hasInvoicableData = App.db.nurses.some((nurse) =>
        App.db.transactions.some((t) => {
          const pDate = App.Utils.parseDate(t.paymentDate);
          return (
            pDate &&
            pDate.getFullYear() == year &&
            pDate.getMonth() + 1 == month &&
            t.accountNo === nurse.accountId
          );
        })
      );
      if (hasInvoicableData) {
        availableMonths.add(monthKey);
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
        availableMonths.delete(latestMonthKey);
      }
    }

    if (!calendarCurrentYear) {
      const latestPeriod =
        [...allMonthsWithTransactions].sort().pop() || "1970-01";
      calendarCurrentYear =
        parseInt(latestPeriod.substring(0, 4), 10) || new Date().getFullYear();
    }
    return allMonthsWithTransactions;
  };

  const openCalendarModal = () => {
    getAvailableMonths();
    renderCalendar(calendarCurrentYear);
    document.getElementById("calendar-modal").style.display = "block";
  };

  const closeCalendarModal = () => {
    document.getElementById("calendar-modal").style.display = "none";
  };

  const navigateYear = (direction) => {
    calendarCurrentYear += direction;
    renderCalendar(calendarCurrentYear);
  };

  const renderCalendar = (year) => {
    const allMonthsWithTransactions = getAvailableMonths();
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

      const isEnabled = availableMonths.has(monthStr);
      if (isEnabled) {
        monthEl.classList.add("enabled");
        monthEl.dataset.month = monthStr;

        const nursesToInvoiceThisMonth = new Set(
          App.db.transactions
            .filter(
              (t) =>
                t.paymentDate &&
                t.paymentDate.includes(
                  `.${(i + 1).toString().padStart(2, "0")}.${year}`
                )
            )
            .map((t) => t.accountNo)
        );
        const nurseIdsToInvoice = new Set(
          App.db.nurses
            .filter((n) => nursesToInvoiceThisMonth.has(n.accountId))
            .map((n) => n.id)
        );

        const validatedInvoices = App.db.invoices.filter(
          (inv) => inv.period === monthStr
        );
        if (
          nurseIdsToInvoice.size > 0 &&
          validatedInvoices.length >= nurseIdsToInvoice.size
        ) {
          monthEl.classList.add("month-validated");
        }
      } else if (allMonthsWithTransactions.has(monthStr)) {
      } else {
        monthEl.classList.add("no-data");
      }

      grid.appendChild(monthEl);
    }
  };

  const selectMonthFromCalendar = (e) => {
    if (e.target.classList.contains("enabled")) {
      selectedMonth = e.target.dataset.month;
      const [year, monthNum] = selectedMonth.split("-");
      calendarCurrentYear = parseInt(year, 10);
      const date = new Date(year, monthNum - 1);
      const displaytext = date.toLocaleString("fr-FR", {
        month: "long",
        year: "numeric",
      });
      document.getElementById("change-month-btn").textContent =
        displaytext.charAt(0).toUpperCase() + displaytext.slice(1);
      closeCalendarModal();
      generateInvoiceData();
    }
  };

  const renderView = () => {
    if (!selectedMonth) {
      document.getElementById("change-month-btn").textContent =
        "Sélectionner un mois";
      document.getElementById("invoice-preview-area").innerHTML =
        '<p class="initial-message">Veuillez sélectionner un mois pour commencer.</p>';
      document.getElementById("invoice-nurse-list-area").innerHTML = "";
    }
    App.Utils.updateDataDateRange?.();
    setTimeout(setPanelHeights, 0);
  };

  const generateInvoiceData = () => {
    if (!selectedMonth) return;
    currentInvoiceData = [];
    selectedNurseIndex = -1;
    const [year, month] = selectedMonth.split("-");

    const nursesWithTransactions = App.db.nurses
      .map((nurse) => {
        const transactions = App.db.transactions
          .filter((t) => {
            const pDate = App.Utils.parseDate(t.paymentDate);
            return (
              pDate &&
              pDate.getFullYear() == year &&
              pDate.getMonth() + 1 == month &&
              t.accountNo === nurse.accountId
            );
          })
          .map((t) => ({ ...t }));
        return { nurse, transactions };
      })
      .filter((data) => data.transactions.length > 0);

    nursesWithTransactions.sort((a, b) =>
      a.nurse.lastName.localeCompare(b.nurse.lastName)
    );

    currentInvoiceData = nursesWithTransactions.map(
      ({ nurse, transactions }) => {
        const existingInvoice = App.db.invoices.find(
          (inv) => inv.nurseId === nurse.id && inv.period === selectedMonth
        );

        const data = {
          nurseId: nurse.id,
          nurseName: `${nurse.lastName.toUpperCase()} ${nurse.firstName}`,
          commissionRate: existingInvoice
            ? existingInvoice.commissionRate
            : nurse.defaultCommission,
          transactions,
          status: existingInvoice
            ? existingInvoice.status === "paid"
              ? "printed"
              : "validated"
            : "new",
          totalDueManuallySet: existingInvoice
            ? existingInvoice.totalDueManuallySet || false
            : false,
        };

        data.transactions.forEach((t) => {
          t.isSameDebtorPatient =
            t.debtor?.toLowerCase() === t.patient?.toLowerCase();
          const savedTx = existingInvoice?.transactions?.find(
            (stx) => stx.reference === t.reference
          );
          t.included = savedTx ? savedTx.included : !t.isSameDebtorPatient;
        });

        if (existingInvoice) {
          data.totalDue = existingInvoice.totalDue;
        }

        return data;
      }
    );

    recalculateAllNurses();
    renderNurseList();
    document.getElementById("invoice-preview-area").innerHTML =
      '<p class="initial-message">Veuillez sélectionner une infirmière dans la liste de droite.</p>';
  };

  const renderNurseList = () => {
    const nurseListArea = document.getElementById("invoice-nurse-list-area");
    if (!nurseListArea) return;
    if (currentInvoiceData.length === 0) {
      nurseListArea.innerHTML =
        '<p class="initial-message">Aucune infirmière à facturer pour ce mois.</p>';
      return;
    }
    let grandTotal = currentInvoiceData.reduce(
      (sum, data) => sum + (data.totalDue || 0),
      0
    );
    const listHtml = currentInvoiceData
      .map((nurseData, index) => {
        const actionHtml =
          nurseData.status !== "new"
            ? `<button class="nurse-action-button pdf-btn" data-action="generate-pdf" data-nurse-index="${index}">Imprimer PDF</button>`
            : "";
        return `<div class="nurse-list-item ${
          selectedNurseIndex === index ? "selected" : ""
        }" data-nurse-index="${index}">
              <span class="name">${nurseData.nurseName}</span>
              <span class="amount">${App.Utils.formatNumber(
                nurseData.totalDue
              )}</span>
              <div class="action-container">${actionHtml}</div>
              </div>`;
      })
      .join("");

    nurseListArea.innerHTML = `
          <div class="invoice-nurse-list-header">
              <span class="name">Infirmières</span><span class="amount">Comm. CHF</span><span class="action-container">Action</span>
          </div>
          <div class="nurse-list-container">${listHtml}</div>
          <div class="nurse-list-total">
              <span class="name">Total</span><span class="amount">${App.Utils.formatNumber(
                grandTotal
              )}</span>
              <div class="action-container"><button id="print-all-invoices-btn">Générer Tout</button></div>
          </div>`;
    setTimeout(setPanelHeights, 0);
  };

  const recalculateNurseSummary = (nurseIndex, forceRecalculation = false) => {
    const nurseData = currentInvoiceData[nurseIndex];
    if (!nurseData) return;

    const includedTransactions = nurseData.transactions.filter(
      (t) => t.included
    );
    const totalCA = includedTransactions.reduce((sum, t) => sum + t.amount, 0);
    const commissionAmount = (totalCA * nurseData.commissionRate) / 100;

    let bonusAmount = 0;
    let bonusRate = 0;
    let quarterlyCA = 0;

    if (selectedMonth && nurseData.commissionRate > 10) {
      const [year, month] = selectedMonth.split("-");
      const monthNumber = parseInt(month, 10);
      if ([3, 6, 9, 12].includes(monthNumber)) {
        const quarterStartMonth = monthNumber - 2;
        const nurse = App.db.nurses.find((n) => n.id === nurseData.nurseId);
        if (nurse) {
          const quarterTransactions = App.db.transactions.filter((t) => {
            if (!t.paymentDate) return false;
            const paymentDate = App.Utils.parseDate(t.paymentDate);
            const isPatientPayer =
              t.debtor?.toLowerCase() === t.patient?.toLowerCase();
            return (
              paymentDate &&
              !isPatientPayer &&
              t.accountNo === nurse.accountId &&
              paymentDate.getFullYear() == year &&
              paymentDate.getMonth() + 1 >= quarterStartMonth &&
              paymentDate.getMonth() + 1 <= monthNumber
            );
          });
          quarterlyCA = quarterTransactions.reduce(
            (sum, t) => sum + t.amount,
            0
          );
          const bonusTier = App.db.settings.bonusTiers.find(
            (tier) => quarterlyCA >= tier.from && quarterlyCA <= tier.to
          );
          if (bonusTier && bonusTier.rate > 0) {
            bonusAmount = (quarterlyCA * bonusTier.rate) / 100;
            bonusRate = bonusTier.rate;
          }
        }
      }
    }

    nurseData.totalCA = totalCA;
    nurseData.totalCommission = commissionAmount;
    nurseData.quarterlyCA = quarterlyCA;
    nurseData.bonusRate = bonusRate;

    if (!nurseData.bonusManuallySet) {
      nurseData.bonusAmount = bonusAmount;
    }

    if (!nurseData.totalDueManuallySet || forceRecalculation) {
      nurseData.totalDue = App.Utils.roundToFiveCents(
        commissionAmount - (nurseData.bonusAmount || 0)
      );
    } else {
      nurseData.totalCommission =
        nurseData.totalDue + (nurseData.bonusAmount || 0);
    }
  };

  const recalculateAllNurses = () =>
    currentInvoiceData.forEach((_, index) => {
      recalculateNurseSummary(index, false);
    });

  const renderInvoicePreviewForNurse = (nurseIndex) => {
    const nurseData = currentInvoiceData[nurseIndex];
    if (!nurseData) return;

    const previewArea = document.getElementById("invoice-preview-area");
    const isReadOnly =
      nurseData.status === "validated" || nurseData.status === "printed";
    const allSelected = nurseData.transactions.every(
      (t) => t.included || t.isSameDebtorPatient
    );

    let bonusHtml = "";
    if (
      (nurseData.bonusAmount != null && nurseData.bonusAmount > 0) ||
      nurseData.quarterlyCA > 0
    ) {
      bonusHtml = `
          <tr>
              <td colspan="4" class="total-label">Bonus Trimestriel :</td>
              <td style="text-align: right;">${App.Utils.formatNumber(
                nurseData.quarterlyCA || 0
              )}</td>
              <td style="text-align: center;">${nurseData.bonusRate || 0}%</td>
              <td style="text-align: right;" class="total-value bonus-value">
                  <input type="number" step="0.05" class="bonus-amount-input" value="${(
                    nurseData.bonusAmount || 0
                  ).toFixed(2)}" ${isReadOnly ? "disabled" : ""}>
              </td>
          </tr>`;
    }

    const tableHtml = `
      <h3 class="no-margin-top">Détail pour ${nurseData.nurseName}</h3>
      <table>
          <thead><tr>
          <th><input type="checkbox" id="select-all-transactions" ${
            isReadOnly ? "disabled" : ""
          } ${allSelected ? "checked" : ""}></th>
          <th>Mois de soins</th><th>Patient</th><th>Payé par</th>
          <th style="text-align: right;">C.A.</th><th>Comm.%</th><th style="text-align: right;">Comm.CHF</th>
          </tr></thead>
          <tbody>
          ${nurseData.transactions
            .map((t, i) => {
              const commissionRate = t.included ? nurseData.commissionRate : 0;
              const commission = t.amount * (commissionRate / 100);
              const prestationDate = App.Utils.parseDate(t.treatmentStart);
              const prestationMonth = prestationDate
                ? prestationDate.toLocaleString("fr-FR", {
                    month: "short",
                    year: "2-digit",
                  })
                : "N/A";
              return `
              <tr class="${t.isSameDebtorPatient ? "debit-patient-same" : ""}">
                  <td style="text-align: center;"><input type="checkbox" class="transaction-checkbox" data-trans-index="${i}" ${
                t.included ? "checked" : ""
              } ${isReadOnly ? "disabled" : ""}></td>
                  <td>${prestationMonth}</td><td class="patient-cell">${
                t.patient
              }</td><td>${t.isSameDebtorPatient ? "Pat." : "Ass."}</td>
                  <td style="text-align: right;">${App.Utils.formatNumber(
                    t.amount
                  )}</td>
                  <td class="commission-percent-cell">${commissionRate}</td>
                  <td style="text-align: right;">${App.Utils.formatNumber(
                    commission
                  )}</td>
              </tr>`;
            })
            .join("")}
          </tbody>
          <tfoot>
          <tr>
              <td colspan="4" class="total-label">Totaux :</td>
              <td style="text-align: right;" id="preview-total-ca">${App.Utils.formatNumber(
                nurseData.totalCA || 0
              )}</td>
              <td style="text-align: center;"><input type="number" class="commission-rate-input" value="${
                nurseData.commissionRate
              }" ${isReadOnly ? "disabled" : ""}></td>
              <td style="text-align: right;" class="total-value" id="preview-total-commission">${App.Utils.formatNumber(
                nurseData.totalCommission || 0
              )}</td>
          </tr>
          ${bonusHtml}
          <tr>
              <td colspan="6" class="total-label">Total dû :</td>
              <td style="text-align: right;" class="total-value"><input type="number" step="0.05" class="${
                nurseData.totalDueManuallySet
                  ? "total-due-input manual"
                  : "total-due-input"
              }" value="${(nurseData.totalDue || 0).toFixed(2)}" ${
      isReadOnly ? "disabled" : ""
    }></td>
          </tr>
          </tfoot>
      </table>
      <div class="invoice-actions">
          ${
            isReadOnly
              ? `<button class="nurse-action-button modify-btn" data-action="modify" data-nurse-index="${nurseIndex}">Modifier</button>`
              : `<button class="nurse-action-button" data-action="validate" data-nurse-index="${nurseIndex}">Valider</button>`
          }
      </div>`;

    previewArea.innerHTML = tableHtml;

    previewArea
      .querySelector("#select-all-transactions")
      .addEventListener("change", (e) => {
        if (isReadOnly) return;
        const isChecked = e.target.checked;
        nurseData.transactions.forEach((t) => {
          t.included = isChecked;
        });
        nurseData.totalDueManuallySet = false;
        recalculateNurseSummary(nurseIndex, true);
        renderInvoicePreviewForNurse(nurseIndex);
      });
  };

  const handleTableInput = (e) => {
    if (!e.target || selectedNurseIndex < 0) return;
    const nurseData = currentInvoiceData[selectedNurseIndex];

    if (e.target.classList.contains("total-due-input")) {
      const newTotalDue = parseFloat(e.target.value) || 0;
      nurseData.totalDue = newTotalDue;
      nurseData.totalCommission = newTotalDue + (nurseData.bonusAmount || 0);
      nurseData.totalDueManuallySet = true;
      document.getElementById("preview-total-commission").textContent =
        App.Utils.formatNumber(nurseData.totalCommission);
      renderNurseList();
    } else if (e.target.classList.contains("bonus-amount-input")) {
      nurseData.bonusAmount = parseFloat(e.target.value) || 0;
      nurseData.bonusManuallySet = true;
      nurseData.totalDueManuallySet = false;
      recalculateNurseSummary(selectedNurseIndex, true);
      document.querySelector(".total-due-input").value = (
        nurseData.totalDue || 0
      ).toFixed(2);
      renderNurseList();
    }
  };

  const handleTableChange = (e) => {
    if (!e.target || selectedNurseIndex < 0) return;
    const nurseData = currentInvoiceData[selectedNurseIndex];
    let needsFullRender = false;

    if (e.target.classList.contains("commission-rate-input")) {
      nurseData.commissionRate = parseFloat(e.target.value) || 0;
      nurseData.totalDueManuallySet = false;
      recalculateNurseSummary(selectedNurseIndex, true);
      needsFullRender = true;
    }
    if (e.target.classList.contains("transaction-checkbox")) {
      const transIndex = parseInt(e.target.dataset.transIndex, 10);
      if (!isNaN(transIndex))
        nurseData.transactions[transIndex].included = e.target.checked;
      nurseData.totalDueManuallySet = false;
      recalculateNurseSummary(selectedNurseIndex, true);
      needsFullRender = true;
    }
    if (needsFullRender) {
      renderInvoicePreviewForNurse(selectedNurseIndex);
    }
  };

  const handleNurseListClick = (e) => {
    if (e.target.closest("#print-all-invoices-btn")) {
      printAllValidatedInvoices();
      return;
    }
    const actionButton = e.target.closest(".nurse-action-button");
    if (actionButton) {
      handleInvoiceActionClick(e);
      return;
    }
    const targetItem = e.target.closest(".nurse-list-item");
    if (targetItem) {
      const nurseIndex = parseInt(targetItem.dataset.nurseIndex, 10);
      selectedNurseIndex = nurseIndex;
      renderInvoicePreviewForNurse(nurseIndex);
      renderNurseList();
    }
  };

  const handleInvoiceActionClick = (e) => {
    const button = e.target.closest(".nurse-action-button");
    if (!button) return;
    const action = button.dataset.action;
    const nurseIndex = parseInt(button.dataset.nurseIndex, 10);
    if (isNaN(nurseIndex) || !currentInvoiceData[nurseIndex]) return;

    const nurseData = currentInvoiceData[nurseIndex];
    if (action === "validate") {
      nurseData.status = "validated";
      saveOrUpdateInvoice(nurseIndex);
    } else if (action === "modify") {
      nurseData.status = "new";
    } else if (action === "generate-pdf") {
      // Pour une seule facture, la question est posée ici
      const includeLedger = confirm(
        "Voulez-vous inclure le relevé de compte de l'année avec la facture ?"
      );
      printSingleInvoice(nurseIndex, includeLedger, false);
      return;
    }
    renderInvoicePreviewForNurse(nurseIndex);
    renderNurseList();
  };

  const saveOrUpdateInvoice = (index) => {
    const invData = currentInvoiceData[index];
    const existingInvoiceIndex = App.db.invoices.findIndex(
      (inv) => inv.nurseId === invData.nurseId && inv.period === selectedMonth
    );

    const isNew = existingInvoiceIndex === -1;
    let dateIssued;
    if (isNew) {
      const paymentMonthDate = new Date(selectedMonth + "-01T12:00:00Z");
      const cutoffDate = new Date("2025-07-01T12:00:00Z");
      dateIssued =
        paymentMonthDate < cutoffDate
          ? getFirstWorkingDayOfNextMonth(paymentMonthDate).toISOString()
          : new Date().toISOString();
    } else {
      dateIssued = App.db.invoices[existingInvoiceIndex].dateIssued;
    }

    const record = {
      id: isNew
        ? `inv_${Date.now()}_${Math.random()}`
        : App.db.invoices[existingInvoiceIndex].id,
      nurseId: invData.nurseId,
      nurseName: invData.nurseName,
      period: selectedMonth,
      dateIssued: dateIssued,
      status: invData.status === "printed" ? "paid" : "unpaid",
      monthlyCA: invData.totalCA,
      commissionRate: invData.commissionRate,
      commissionAmount: invData.totalCommission,
      bonusAmount: invData.bonusAmount,
      totalDue: invData.totalDue,
      totalDueManuallySet: invData.totalDueManuallySet || false,
      transactions: invData.transactions.map((t) => ({
        reference: t.reference,
        included: t.included,
      })),
    };

    if (!isNew) App.db.invoices[existingInvoiceIndex] = record;
    else App.db.invoices.push(record);

    App.DB.save();
  };

  const printSingleInvoice = async (
    index,
    includeLedger,
    suppressAlert = false
  ) => {
    const invoiceData = currentInvoiceData[index];
    const { jsPDF } = window.jspdf;
    const nurse = App.db.nurses.find((n) => n.id === invoiceData.nurseId);
    const invoiceRecord = App.db.invoices.find(
      (inv) => inv.nurseId === nurse.id && inv.period === selectedMonth
    );

    if (!invoiceRecord) {
      if (!suppressAlert)
        alert("La facture doit être validée avant de pouvoir être imprimée.");
      return;
    }

    const invoiceDate = new Date(invoiceRecord.dateIssued);
    const invoiceDateString = invoiceDate.toLocaleDateString("fr-CH");

    const paymentMonthDate = new Date(selectedMonth + "-01T12:00:00Z");
    const paymentMonthName = paymentMonthDate.toLocaleString("fr-FR", {
      month: "long",
      year: "numeric",
    });
    const fileName = `${
      includeLedger ? "Facture et Relevé" : "Facture"
    } ${nurse.lastName.toUpperCase()} - ${paymentMonthName}.pdf`;

    const monthsByYear = {};
    invoiceData.transactions
      .filter((t) => t.included)
      .forEach((t) => {
        const d = App.Utils.parseDate(t.treatmentStart);
        if (d) {
          const y = d.getFullYear();
          const m = d.getMonth();
          if (!monthsByYear[y]) monthsByYear[y] = new Set();
          monthsByYear[y].add(m);
        }
      });
    const treatmentMonthsString = Object.keys(monthsByYear)
      .sort((a, b) => a - b)
      .map((year) => {
        const months = [...monthsByYear[year]]
          .sort((a, b) => a - b)
          .map((m) =>
            new Date(year, m).toLocaleString("fr-FR", { month: "short" })
          )
          .join(", ");
        return `${year} : ${months}`;
      })
      .join("\n");

    const doc = new jsPDF();
    let y = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    if (App.config.logoBase64)
      doc.addImage(App.config.logoBase64, "PNG", 14, y, 64, 29);
    y += 40;
    doc.setFontSize(10);
    nurse.address
      .split("\n")
      .forEach((line) => doc.text(line, pageWidth * 0.6, (y += 5)));
    y += 12;
    doc
      .setFont(undefined, "normal")
      .text(`Genève, le ${invoiceDateString}`, pageWidth * 0.6, y);
    y += 20;
    doc.text(`Infirmier/ère: `, 14, y);
    doc
      .setFont(undefined, "bold")
      .text(`${nurse.firstName} ${nurse.lastName}`, 35, y);
    y += 20;
    doc
      .setFontSize(16)
      .setFont(undefined, "bold")
      .text(`FACTURE DES PRESTATIONS`, pageWidth / 2, y, { align: "center" });

    const tableRows = [
      [
        treatmentMonthsString,
        paymentMonthName,
        App.Utils.formatNumber(invoiceData.totalCA),
        invoiceData.commissionRate.toFixed(1),
        App.Utils.formatNumber(invoiceData.totalCommission),
      ],
    ];
    if (invoiceData.bonusAmount > 0) {
      tableRows.push([
        "Bonus Trimestriel (à déduire)",
        "",
        App.Utils.formatNumber(invoiceData.quarterlyCA),
        invoiceData.bonusRate.toFixed(1),
        `-${App.Utils.formatNumber(invoiceData.bonusAmount)}`,
      ]);
    }

    doc.autoTable({
      startY: (y += 10),
      head: [
        ["Mois de soins", "Paiement reçu en", "C.A.", "Services %", "Montant"],
      ],
      body: tableRows,
      theme: "grid",
      headStyles: { halign: "center" },
      columnStyles: {
        0: { cellWidth: 58, halign: "left" },
        1: { cellWidth: 35, halign: "center" },
        2: { cellWidth: 32, halign: "right" },
        3: { cellWidth: 23, halign: "center" },
        4: { cellWidth: 32, halign: "right" },
      },
    });

    let finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12).setFont(undefined, "bold");
    doc.text("Total:", 160, finalY, { align: "right" });
    doc.text(
      `CHF ${App.Utils.formatNumber(invoiceData.totalDue)}`,
      193,
      finalY,
      {
        align: "right",
      }
    );

    finalY += 15;
    doc.setFontSize(9).setFont(undefined, "normal");
    doc.text(
      "Votre règlement doit s'effectuer sur le compte de la BCGE ci-dessous.",
      14,
      finalY
    );
    doc
      .setFont(undefined, "bold")
      .text(App.db.settings.paymentInfo.beneficiary, 14, (finalY += 5));
    doc.setFont(undefined, "normal");
    doc.text(`Banque: ${App.db.settings.paymentInfo.bank}`, 14, (finalY += 5));
    doc.text(`IBAN: ${App.db.settings.paymentInfo.iban}`, 14, (finalY += 5));
    doc.text("Paiement sous 10 jours.", 14, (finalY += 10));
    doc.text(
      "Avec nos remerciements et merci d'avance pour le prompt règlement.",
      14,
      (finalY += 5)
    );
    finalY += 25;
    doc.text("Christian Roux", 14, finalY);
    doc.text("CESAD Management", 14, (finalY += 5));

    if (includeLedger) {
      generateLedgerPage(doc, nurse, paymentMonthDate.getFullYear());
    }

    doc.save(fileName);

    // La ligne incorrecte qui posait la question absurde a été supprimée ici.

    invoiceData.status = "printed";
    saveOrUpdateInvoice(index);
    if (selectedNurseIndex === index) renderInvoicePreviewForNurse(index);
    renderNurseList();
  };

  const generateLedgerPage = (doc, nurse, year) => {
    doc.addPage();
    const invoices = App.db.invoices
      .filter((inv) => inv.nurseId === nurse.id)
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
      .filter((p) => p.matchedNurseId === nurse.id)
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

    if (year === 2025 && nurse.openingBalance2024) {
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
  };

  const printAllValidatedInvoices = async () => {
    const invoicesToPrint = currentInvoiceData
      .map((d, i) => ({ ...d, originalIndex: i }))
      .filter((d) => d.status === "validated" || d.status === "printed");

    if (invoicesToPrint.length === 0) {
      alert("Aucune facture validée à imprimer.");
      return;
    }

    if (
      confirm(
        `Vous êtes sur le point de générer ${invoicesToPrint.length} facture(s) en PDF. Continuer ?`
      )
    ) {
      // La question est posée une seule fois ici
      const attachLedgerForAll = confirm(
        "Voulez-vous joindre le relevé de compte à TOUTES les factures ?"
      );

      for (const invoice of invoicesToPrint) {
        // La réponse est passée en paramètre à chaque appel
        await printSingleInvoice(
          invoice.originalIndex,
          attachLedgerForAll,
          true
        );
      }
      alert(
        `${invoicesToPrint.length} facture(s) ont été générées et sauvegardées.`
      );
    }
  };

  return { init, renderView, checkForNavigation };
})();
