// js/dashboard.js
App.Dashboard = (() => {
  let commissionChartInstance = null;
  let currentEndDate;

  const init = () => {
    // Initialisation de la vue principale
    renderDashboardInfo();

    // Initialisation du graphique
    currentEndDate = new Date();
    currentEndDate.setDate(1);

    const prevBtn = document.getElementById("prev-month-btn");
    const nextBtn = document.getElementById("next-month-btn");

    if (prevBtn && nextBtn) {
      prevBtn.addEventListener("click", () => navigateMonth(-1));
      nextBtn.addEventListener("click", () => navigateMonth(1));
    }
    renderRollingMonthChart();
  };

  /**
   * Orchestre le remplissage du panneau d'informations.
   */
  const renderDashboardInfo = () => {
    displayNextInvoicingMonth();
    displayDateRanges();
    displayMissingNurseInfo();
  };

  /**
   * Détermine et affiche le prochain mois à facturer.
   */
  const displayNextInvoicingMonth = () => {
    const el = document.getElementById("next-invoicing-month");
    if (!el) return;

    const transactionMonths = [
      ...new Set(
        App.db.transactions
          .map((t) =>
            t.paymentDate
              ? `${App.Utils.parseDate(t.paymentDate).getFullYear()}-${(
                  App.Utils.parseDate(t.paymentDate).getMonth() + 1
                )
                  .toString()
                  .padStart(2, "0")}`
              : null
          )
          .filter(Boolean)
      ),
    ]
      .filter((month) => parseInt(month.substring(0, 4), 10) >= 2025)
      .sort();

    let nextMonth = "Toutes les factures semblent à jour.";
    for (const month of transactionMonths) {
      const [year, monthNum] = month.split("-");

      const transactionsForMonth = App.db.transactions.filter((t) => {
        const pDate = App.Utils.parseDate(t.paymentDate);
        return (
          pDate &&
          pDate.getFullYear() == year &&
          pDate.getMonth() + 1 == monthNum
        );
      });

      const nursesWithTransactions = new Set(
        transactionsForMonth.map((t) => t.accountNo)
      );
      const nurseIdsWithTransactions = new Set(
        App.db.nurses
          .filter((n) => nursesWithTransactions.has(n.accountId))
          .map((n) => n.id)
      );

      // **MODIFIÉ** : Le filtre exclut maintenant les factures manuelles.
      const validatedInvoices = App.db.invoices.filter(
        (inv) => inv.period === month && !inv.isManual
      );

      if (validatedInvoices.length < nurseIdsWithTransactions.size) {
        const date = new Date(year, monthNum - 1);
        nextMonth = date.toLocaleString("fr-FR", {
          month: "long",
          year: "numeric",
        });
        nextMonth = nextMonth.charAt(0).toUpperCase() + nextMonth.slice(1);
        break;
      }
    }
    el.textContent = nextMonth;
  };

  /**
   * Calcule et affiche les plages de dates pour les transactions et les paiements.
   */
  const displayDateRanges = () => {
    const transEl = document.getElementById("transaction-data-range");
    const bankEl = document.getElementById("bank-data-range");

    if (transEl && App.db.transactions.length > 0) {
      const dates = App.db.transactions
        .map((t) => App.Utils.parseDate(t.paymentDate))
        .filter((d) => d && !isNaN(d));
      if (dates.length > 0) {
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        transEl.textContent = `Du ${minDate.toLocaleDateString(
          "fr-CH"
        )} au ${maxDate.toLocaleDateString("fr-CH")}`;
      }
    }

    if (bankEl && App.db.bankPayments.length > 0) {
      const dates = App.db.bankPayments
        .map((p) => App.Utils.parseDate(p.date))
        .filter((d) => d && !isNaN(d));
      if (dates.length > 0) {
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        bankEl.textContent = `Du ${minDate.toLocaleDateString(
          "fr-CH"
        )} au ${maxDate.toLocaleDateString("fr-CH")}`;
      }
    }
  };

  /**
   * Vérifie les infos manquantes pour les infirmières et les affiche.
   */
  const displayMissingNurseInfo = () => {
    const el = document.getElementById("missing-nurse-info");
    if (!el) return;

    let missingInfo = [];

    App.db.nurses.forEach((nurse) => {
      let issues = [];
      if (!nurse.firstName || !nurse.lastName) issues.push("nom/prénom");
      if (!nurse.address) {
        issues.push("adresse");
      }
      if (!nurse.defaultCommission) issues.push("commission");

      if (issues.length > 0) {
        missingInfo.push(
          `<li><strong>${nurse.lastName.toUpperCase()} ${
            nurse.firstName
          } :</strong> Manque ${issues.join(", ")}</li>`
        );
      }
    });

    if (missingInfo.length > 0) {
      el.innerHTML = `<ul>${missingInfo.join("")}</ul>`;
    } else {
      el.textContent = "Aucune information manquante. ✅";
    }
  };

  const navigateMonth = (direction) => {
    currentEndDate.setMonth(currentEndDate.getMonth() + direction);
    renderRollingMonthChart();
  };

  const renderRollingMonthChart = () => {
    if (!App.db || !App.db.invoices) return;

    const monthDisplay = document.getElementById("chart-month-display");
    if (monthDisplay) {
      const displayDate = currentEndDate.toLocaleString("fr-FR", {
        month: "long",
        year: "numeric",
      });
      monthDisplay.textContent =
        displayDate.charAt(0).toUpperCase() + displayDate.slice(1);
    }

    const labels = [];
    const monthlyTotals = [];
    const monthlyBonusTotals = [];

    let startDate = new Date(currentEndDate);
    startDate.setMonth(startDate.getMonth() - 11);

    for (let i = 0; i < 12; i++) {
      const iterDate = new Date(
        startDate.getFullYear(),
        startDate.getMonth() + i,
        1
      );
      const year = iterDate.getFullYear();
      const month = iterDate.getMonth();

      labels.push(
        iterDate.toLocaleString("fr-FR", { month: "short", year: "2-digit" })
      );
      const periodString = `${year}-${(month + 1).toString().padStart(2, "0")}`;

      let monthTotal = 0;
      let bonusTotal = 0;

      App.db.invoices.forEach((invoice) => {
        if (invoice.period === periodString && !invoice.isManual) {
          //
          monthTotal += invoice.totalDue || 0; //
          if (invoice.bonusAmount && invoice.bonusAmount > 0) {
            //
            bonusTotal += invoice.bonusAmount; //
          }
        }
      });

      monthlyTotals.push(monthTotal);
      monthlyBonusTotals.push(bonusTotal);
    }

    const canvas = document.getElementById("commissionChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (commissionChartInstance) commissionChartInstance.destroy();

    commissionChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Commissions validées",
            data: monthlyTotals,
            backgroundColor: "rgba(0, 90, 156, 0.6)",
            borderColor: "rgba(0, 90, 156, 1)",
            borderWidth: 1,
          },
          {
            label: "Bonus versés",
            data: monthlyBonusTotals,
            backgroundColor: "rgba(255, 87, 87, 0.7)",
            borderColor: "rgba(255, 87, 87, 1)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              callback: (value) => "CHF " + value.toLocaleString("fr-CH"),
            },
          },
        },
        plugins: {
          legend: { display: true },
          title: {
            display: true,
            text: `Commissions et bonus sur 12 mois glissants`,
          },
          tooltip: {
            callbacks: {
              label: (context) =>
                `${
                  context.dataset.label || ""
                }: CHF ${context.parsed.y.toLocaleString("fr-CH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`,
            },
          },
        },
      },
    });
  };

  return { init };
})();
