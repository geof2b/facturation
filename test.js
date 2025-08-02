App.Invoicing = (() => {
  let currentInvoiceData = [];
  let selectedMonth = null;
  let availableMonths = new Set();
  let calendarCurrentYear = new Date().getFullYear();
  let selectedNurseIndex = -1;

  const setPanelHeights = () => {
    // ... (code inchangé)
  };

  const init = () => {
    // ... (code inchangé)
  };

  const checkForNavigation = () => {
    // ... (code inchangé)
  };

  const getAvailableMonths = () => {
    // ... (code inchangé)
  };

  const openCalendarModal = () => {
    // ... (code inchangé)
  };

  const closeCalendarModal = () => {
    // ... (code inchangé)
  };

  const navigateYear = (direction) => {
    // ... (code inchangé)
  };

  const renderCalendar = (year) => {
    // ... (code inchangé)
  };

  const selectMonthFromCalendar = (e) => {
    // ... (code inchangé)
  };

  const renderView = () => {
    // ... (code inchangé)
  };

  const generateInvoiceData = () => {
    // ... (code inchangé)
  };

  const renderNurseList = () => {
    // ... (code inchangé)
  };

  const recalculateNurseSummary = (nurseIndex) => {
    const nurseData = currentInvoiceData[nurseIndex];
    if (!nurseData) return;

    // Si le total a été modifié manuellement et qu'on ne recalcule pas, on sort.
    if (nurseData.totalDueManuallySet) {
      return;
    }

    const includedTransactions = nurseData.transactions.filter((t) => t.included);
    const totalCA = includedTransactions.reduce((sum, t) => sum + t.amount, 0);
    const commissionAmount = (totalCA * nurseData.commissionRate) / 100;

    let bonusAmount = 0;
    if (selectedMonth) {
      const [year, month] = selectedMonth.split("-");
      const monthNumber = parseInt(month, 10);
      if ([3, 6, 9, 12].includes(monthNumber)) {
        const quarterStartMonth = monthNumber - 2;
        const nurse = App.db.nurses.find((n) => n.id === nurseData.nurseId);
        if (nurse) {
          const quarterTransactions = App.db.transactions.filter((t) => {
            if (!t.paymentDate) return false;
            const paymentDate = App.Utils.parseDate(t.paymentDate);
            return (
              paymentDate &&
              t.accountNo === nurse.accountId &&
              paymentDate.getFullYear() == year &&
              paymentDate.getMonth() + 1 >= quarterStartMonth &&
              paymentDate.getMonth() + 1 <= monthNumber
            );
          });
          const quarterlyCA = quarterTransactions.reduce((sum, t) => sum + t.amount, 0);
          const bonusTier = App.db.settings.bonusTiers.find(
            (tier) => quarterlyCA >= tier.from && quarterlyCA <= tier.to
          );
          if (bonusTier && bonusTier.rate > 0) {
            bonusAmount = (quarterlyCA * bonusTier.rate) / 100;
          }
        }
      }
    }

    nurseData.totalCA = totalCA;
    nurseData.totalCommission = commissionAmount;
    nurseData.bonusAmount = bonusAmount;
    nurseData.totalDue = App.Utils.roundToFiveCents(commissionAmount - bonusAmount);
  };

  const recalculateAllNurses = () => {
    currentInvoiceData.forEach((_, index) => recalculateNurseSummary(index));
  };

  const renderInvoicePreviewForNurse = (nurseIndex) => {
    selectedNurseIndex = nurseIndex;
    const nurseData = currentInvoiceData[nurseIndex];
    if (!nurseData) return;

    const previewArea = document.getElementById("invoice-preview-area");
    const isReadOnly = nurseData.status === "validated" || nurseData.status === "printed";

    const allSelected = nurseData.transactions.every((t) => t.included);

    let tableHtml = `<h3 class="no-margin-top">Détail pour ${
      nurseData.nurseName
    }</h3><table><thead><tr>
        <th><input type="checkbox" id="select-all-transactions" ${isReadOnly ? "disabled" : ""} ${
      allSelected ? "checked" : ""
    }></th>
        <th>Mois de soins</th><th>Patient</th><th>Payé par</th>
        <th style="text-align: right;">C.A.</th>
        <th style="text-align: center;">Comm.<br>%</th>
        <th style="text-align: right;">Comm.<br>CHF</th>
        </tr></thead><tbody>`;

    nurseData.transactions.forEach((t) => {
      const commissionRate = t.isSameDebtorPatient && !t.included ? 0 : nurseData.commissionRate;
      const commission = t.amount * (commissionRate / 100);
      const prestationDate = App.Utils.parseDate(t.treatmentStart);
      const prestationMonth = prestationDate
        ? prestationDate.toLocaleString("fr-FR", {
            month: "short",
            year: "2-digit",
          })
        : "N/A";

      const paidBy = t.isSameDebtorPatient ? "Pat." : "Ass.";

      tableHtml += `<tr class="${t.isSameDebtorPatient ? "debit-patient-same" : ""} ${
        !t.included && !t.isSameDebtorPatient ? "transaction-excluded" : ""
      }">
          <td style="text-align: center;"><input type="checkbox" class="transaction-checkbox" 
             data-nurse-index="${nurseIndex}" data-trans-index="${t.reference}" 
             ${t.included ? "checked" : ""} ${isReadOnly ? "disabled" : ""}></td>
          <td>${prestationMonth}</td><td class="patient-cell">${t.patient}</td>
          <td>${paidBy}</td>
          <td style="text-align: right;">${App.Utils.formatNumber(t.amount)}</td>
          <td class="commission-percent-cell">${commissionRate}</td>
          <td style="text-align: right;">${App.Utils.formatNumber(commission)}</td></tr>`;
    });

    let actionButtonHtml = "";
    switch (nurseData.status) {
      case "validated":
      case "printed":
        actionButtonHtml = `<button class="nurse-action-button modify-btn" data-action="modify" data-nurse-index="${nurseIndex}" style="font-size: 0.9em";
>Modifier</button>`;
        break;
      default:
        actionButtonHtml = `<button class="nurse-action-button" data-action="validate" data-nurse-index="${nurseIndex}" style="font-size: 0.9em";
>Valider</button>`;
        break;
    }

    // MODIFIÉ : Le total dû est maintenant un input
    const totalDueInputClass = nurseData.totalDueManuallySet
      ? "total-due-input manual"
      : "total-due-input";

    tableHtml += `</tbody>
        <tfoot>
            <tr>
                <td colspan="4" class="total-label">Totaux :</td>
                <td style="text-align: right;">${App.Utils.formatNumber(
                  nurseData.totalCA || 0
                )}</td>
                <td style="text-align: center;">
                    <input type="number" class="commission-rate-input" id="commission-rate-input-${nurseIndex}" value="${
      nurseData.commissionRate
    }" 
                           data-nurse-index="${nurseIndex}" ${isReadOnly ? "disabled" : ""}>
                </td>
                <td style="text-align: right;" class="total-value">${App.Utils.formatNumber(
                  nurseData.totalCommission || 0
                )}</td>
            </tr>
            <tr>
                <td colspan="6" class="total-label">Total dû :</td>
                <td style="text-align: right;" class="total-value">
                   <input type="number" step="0.05" class="${totalDueInputClass}" data-nurse-index="${nurseIndex}" value="${(
      nurseData.totalDue || 0
    ).toFixed(2)}" ${isReadOnly ? "disabled" : ""}>
                </td>
            </tr>
        </tfoot>
    </table>
    <div style="text-align: right; margin: 20px 6px 20px 20px;">${actionButtonHtml}</div>`;

    previewArea.innerHTML = tableHtml;
    previewArea.querySelector("#select-all-transactions").addEventListener("change", (e) => {
      if (isReadOnly) return;
      const nurseIndex = selectedNurseIndex;
      currentInvoiceData[nurseIndex].totalDueManuallySet = false; // Réinitialise le flag
      currentInvoiceData[nurseIndex].transactions.forEach((t) => (t.included = e.target.checked));
      recalculateNurseSummary(nurseIndex);
      renderInvoicePreviewForNurse(nurseIndex);
      renderNurseList(); // Mettre à jour la liste de droite
    });

    renderNurseList();
  };

  const handleTableChange = (e) => {
    if (!e.target) return;
    const nurseIndex = parseInt(e.target.dataset.nurseIndex, 10);

    if (e.target.classList.contains("total-due-input")) {
      currentInvoiceData[nurseIndex].totalDue = parseFloat(e.target.value);
      currentInvoiceData[nurseIndex].totalDueManuallySet = true;
      renderInvoicePreviewForNurse(nurseIndex); // Pour appliquer la classe "manual"
      renderNurseList();
      return; // Important pour ne pas recalculer
    }

    if (e.target.classList.contains("commission-rate-input")) {
      currentInvoiceData[nurseIndex].commissionRate = parseFloat(e.target.value);
    }
    if (e.target.classList.contains("transaction-checkbox")) {
      const transRef = e.target.dataset.transIndex;
      const transaction = currentInvoiceData[nurseIndex].transactions.find(
        (t) => t.reference === transRef
      );
      if (transaction) transaction.included = e.target.checked;
    }

    // Si la commission ou une transaction change, on force le recalcul
    currentInvoiceData[nurseIndex].totalDueManuallySet = false;
    recalculateNurseSummary(nurseIndex);
    renderInvoicePreviewForNurse(nurseIndex);
    renderNurseList();
  };

  const handleNurseListClick = (e) => {
    // ... (code inchangé)
  };

  const handleInvoiceActionClick = (e) => {
    // ... (code inchangé)
  };

  const saveInvoiceToDb = (index) => {
    // ... (code inchangé)
  };

  const printSingleInvoice = async (index, suppressAlert = false) => {
    // ... (code inchangé)
  };

  const printAllValidatedInvoices = async () => {
    // ... (code inchangé)
  };

  return { init, renderView, checkForNavigation };
})();
