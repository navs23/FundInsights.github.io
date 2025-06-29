
// --- Save/Load Reports as JSON ---
const STORAGE_KEY = 'portfolio_insights_reports';

function getReports() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveReports(reports) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

function autoReportName(rawData) {
    // Use start and end month/year for the report name
    const lines = rawData.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return 'Portfolio Report';
    // Find the column index for 'Month'
    const header = lines[0].split(/\t/).map(h => h.trim());
    const monthIdx = header.findIndex(h => h.toLowerCase().includes('month'));
    if (monthIdx === -1) return 'Portfolio Report';
    // Find first and last non-empty data rows
    const dataRows = lines.slice(1).map(l => l.split(/\t/));
    const validRows = dataRows.filter(row => row.length > monthIdx && row[monthIdx].trim());
    if (!validRows.length) return 'Portfolio Report';
    const startMonth = validRows[0][monthIdx].trim();
    const endMonth = validRows[validRows.length - 1][monthIdx].trim();
    return `${startMonth} To ${endMonth}`;
}

function renderSavedReports() {
    const list = document.getElementById('savedReportsList');
    list.innerHTML = '';
    const reports = getReports();
    if (!reports.length) {
        list.innerHTML = '<div style="color:#888;">No saved reports.</div>';
        return;
    }
    reports.forEach((r, idx) => {
        const row = document.createElement('div');
        row.className = 'saved-report-item';
        row.style = 'display:flex;align-items:center;gap:7px;padding:7px 4px;border-radius:4px;';

        const nameBtn = document.createElement('span');
        nameBtn.textContent = r.name;
        nameBtn.title = r.name;
        nameBtn.style = 'flex:1 1 auto;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        nameBtn.onclick = () => {
            // Load the report as JSON into the textarea
            const textarea = document.getElementById('dataInput');
            textarea.value = JSON.stringify({ name: r.name, rawData: r.rawData }, null, 2);
            // Auto-render the report
            try {
                const parsed = parsePortfolioTable(r.rawData);
                analyzeData(parsed);
                document.getElementById('inputError').textContent = 'Loaded and rendered.';
            } catch (e) {
                document.getElementById('inputError').textContent = 'Loaded, but failed to render: ' + e.message;
            }
            setTimeout(() => { document.getElementById('inputError').textContent = ''; }, 1500);
        };

        // Edit (rename) button
        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.title = 'Rename report';
        editBtn.style = 'border:none;background:none;cursor:pointer;font-size:1em;padding:2px 6px;color:#2980b9;';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            const newName = prompt('Rename report:', r.name);
            if (newName && newName.trim() && newName !== r.name) {
                let reports = getReports();
                // Prevent duplicate names
                if (reports.some((rep, i) => rep.name === newName && i !== idx)) {
                    document.getElementById('inputError').textContent = 'Name already exists!';
                    setTimeout(() => { document.getElementById('inputError').textContent = ''; }, 1200);
                    return;
                }
                reports[idx].name = newName.trim();
                saveReports(reports);
                renderSavedReports();
                document.getElementById('inputError').textContent = 'Renamed!';
                setTimeout(() => { document.getElementById('inputError').textContent = ''; }, 900);
            }
        };

        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑️';
        delBtn.title = 'Delete report';
        delBtn.style = 'border:none;background:none;cursor:pointer;font-size:1em;padding:2px 6px;color:#c0392b;';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            let reports = getReports();
            reports.splice(idx, 1);
            saveReports(reports);
            renderSavedReports();
            document.getElementById('inputError').textContent = 'Deleted!';
            setTimeout(() => { document.getElementById('inputError').textContent = ''; }, 900);
        };

        row.appendChild(nameBtn);
        row.appendChild(editBtn);
        row.appendChild(delBtn);
        list.appendChild(row);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const dataInput = document.getElementById('dataInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const saveBtn = document.getElementById('saveBtn');
    const inputError = document.getElementById('inputError');
    const refreshBtn = document.getElementById('refreshReportsBtn');

    // Load last report (if any)
    const reports = getReports();
    if (reports.length) {
        dataInput.value = reports[reports.length - 1].rawData;
    }
    renderSavedReports();

    analyzeBtn.addEventListener('click', function() {
        inputError.textContent = '';
        let parsed;
        let input = dataInput.value.trim();
        // Try to parse as JSON first
        let rawData = null;
        if (input.startsWith('{')) {
            try {
                const obj = JSON.parse(input);
                if (obj && typeof obj === 'object' && obj.rawData) {
                    rawData = obj.rawData;
                } else {
                    throw new Error('JSON must contain a "rawData" property.');
                }
            } catch (e) {
                inputError.textContent = 'Invalid JSON: ' + e.message;
                return;
            }
        } else {
            rawData = input;
        }
        try {
            parsed = parsePortfolioTable(rawData);
        } catch (e) {
            inputError.textContent = e.message;
            return;
        }
        analyzeData(parsed);
    });

    saveBtn.addEventListener('click', function() {
        const rawData = dataInput.value.trim();
        if (!rawData) {
            inputError.textContent = 'Nothing to save.';
            return;
        }
        const name = autoReportName(rawData);
        let reports = getReports();
        // Overwrite if report with same name exists
        const idx = reports.findIndex(r => r.name === name);
        if (idx !== -1) {
            reports[idx] = { name, rawData };
            inputError.textContent = 'Overwritten!';
        } else {
            reports.push({ name, rawData });
            inputError.textContent = 'Saved!';
        }
        saveReports(reports);
        renderSavedReports();
        setTimeout(() => { inputError.textContent = ''; }, 1200);
    });

    refreshBtn.addEventListener('click', function() {
        renderSavedReports();
        inputError.textContent = 'Refreshed!';
        setTimeout(() => { inputError.textContent = ''; }, 900);
    });
});
// --- Dynamic UI: Analyze Button Handler ---
function renderSummaryCards(yearlyData, years) {
    // Calculate overall summary
    let totalInvested = 0, totalReturns = 0, start = null, end = null;
    years.forEach((year, i) => {
        const d = yearlyData[year];
        totalInvested += d.totalContributions;
        totalReturns += d.totalReturns;
        if (i === 0) start = d.startBalance;
        if (i === years.length - 1) end = d.endBalance;
    });
    const overallReturnRate = ((totalReturns / (start + totalInvested)) * 100);
    const html = `
        <div class="card">
            <h3>Total Portfolio Value</h3>
            <p class="value neutral">£${end ? end.toLocaleString('en-GB', {minimumFractionDigits:2}) : '-'}</p>
        </div>
        <div class="card">
            <h3>Total Invested</h3>
            <p class="value neutral">£${totalInvested.toLocaleString('en-GB', {minimumFractionDigits:2})}</p>
        </div>
        <div class="card">
            <h3>Total Returns</h3>
            <p class="value ${totalReturns >= 0 ? 'positive' : 'negative'}">£${totalReturns.toLocaleString('en-GB', {minimumFractionDigits:2})}</p>
        </div>
        <div class="card">
            <h3>Overall Return Rate</h3>
            <p class="value ${overallReturnRate >= 0 ? 'positive' : 'negative'}">${overallReturnRate.toFixed(1)}%</p>
        </div>
    `;
    document.getElementById('summaryCards').innerHTML = html;
}

function renderYearlyTable(yearlyData, years) {
    const tableBody = document.getElementById('yearlyData');
    tableBody.innerHTML = '';
    let sumReturnPct = 0;
    let countReturnPct = 0;
    years.forEach(year => {
        const data = yearlyData[year];
        const row = tableBody.insertRow();
        const isPartialYear = (data.months.length < 12);
        row.innerHTML = `
            <td ${isPartialYear ? 'class="highlight"' : ''}>${year}${isPartialYear ? '*' : ''}</td>
            <td>£${data.startBalance.toLocaleString('en-GB', {minimumFractionDigits: 2})}</td>
            <td>£${data.totalContributions.toLocaleString('en-GB', {minimumFractionDigits: 2})}</td>
            <td class="${data.totalMarketGains >= 0 ? 'positive' : 'negative'}">£${data.totalMarketGains.toLocaleString('en-GB', {minimumFractionDigits: 2})}</td>
            <td class="${data.totalReturns >= 0 ? 'positive' : 'negative'}">£${data.totalReturns.toLocaleString('en-GB', {minimumFractionDigits: 2})}</td>
            <td class="${data.returnPercentage >= 0 ? 'positive' : 'negative'}">${data.returnPercentage.toFixed(1)}%</td>
            <td>£${data.endBalance.toLocaleString('en-GB', {minimumFractionDigits: 2})}</td>
        `;
        if (!isNaN(data.returnPercentage)) {
            sumReturnPct += data.returnPercentage;
            countReturnPct++;
        }
    });
    // Add average row
    if (countReturnPct > 0) {
        const avg = sumReturnPct / countReturnPct;
        const avgRow = tableBody.insertRow();
        avgRow.innerHTML = `
            <td colspan="5" style="font-weight:bold;text-align:right;">Average Return % by Year:</td>
            <td style="font-weight:bold;">${avg.toFixed(2)}%</td>
            <td></td>
        `;
    }
    // Add footnote for partial years
    const footnoteRow = tableBody.insertRow();
    footnoteRow.innerHTML = '<td colspan="7" style="font-style: italic; color: #666; text-align: center; padding-top: 20px;">* Partial year data</td>';
}

let returnsChart = null;
let portfolioChart = null;
function renderCharts(yearlyData, years) {
    // Destroy previous charts if they exist
    if (returnsChart) returnsChart.destroy();
    if (portfolioChart) portfolioChart.destroy();
    const ctx1 = document.getElementById('returnsChart').getContext('2d');
    returnsChart = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: years.map(year => yearlyData[year].months.length < 12 ? year + '*' : year),
            datasets: [{
                label: 'Annual Returns (£)',
                data: years.map(year => yearlyData[year].totalReturns),
                backgroundColor: years.map(year => yearlyData[year].totalReturns >= 0 ? 'rgba(39, 174, 96, 0.8)' : 'rgba(231, 76, 60, 0.8)'),
                borderColor: years.map(year => yearlyData[year].totalReturns >= 0 ? 'rgba(39, 174, 96, 1)' : 'rgba(231, 76, 60, 1)'),
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '£' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
    const ctx2 = document.getElementById('portfolioChart').getContext('2d');
    portfolioChart = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: years.map(year => yearlyData[year].months.length < 12 ? year + '*' : year),
            datasets: [{
                label: 'Portfolio Value (£)',
                data: years.map(year => yearlyData[year].endBalance),
                borderColor: 'rgba(102, 126, 234, 1)',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: 'rgba(102, 126, 234, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return '£' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function analyzeData(rawData) {
    const yearlyData = groupByYear(rawData);
    const years = Object.keys(yearlyData).sort();
    renderSummaryCards(yearlyData, years);
    renderYearlyTable(yearlyData, years);
    renderCharts(yearlyData, years);
}

document.addEventListener('DOMContentLoaded', function() {
    const dataInput = document.getElementById('dataInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const inputError = document.getElementById('inputError');

    analyzeBtn.addEventListener('click', function() {
        inputError.textContent = '';
        let parsed;
        try {
            parsed = parsePortfolioTable(dataInput.value);
        } catch (e) {
            inputError.textContent = e.message;
            return;
        }
        analyzeData(parsed);
    });
});

// Helper: Parse pasted table data (tab-separated, with £ and commas, and possible minus signs)
function parsePortfolioTable(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('Paste at least two lines (header and one row)');
    // Find header columns
    const header = lines[0].split(/\t/).map(h => h.trim());
    // Map header names to our keys
    const colMap = {
        'Month': 'month',
        'Beginning balance': 'beginning',
        'Purchases & Withdrawals': 'purchases',
        'Market Gain/Loss': 'marketGain',
        'Income returns': 'income',
        'Fees': 'fees',
        'Ending balance': 'ending',
    };
    // Find column indices for required fields
    const idx = {};
    for (const [label, key] of Object.entries(colMap)) {
        idx[key] = header.findIndex(h => h.toLowerCase().includes(label.toLowerCase()));
        if (idx[key] === -1) throw new Error('Missing column: ' + label);
    }
    // Parse each row
    const data = [];
    for (let i = 1; i < lines.length; ++i) {
        const cells = lines[i].split(/\t/);
        if (cells.length < header.length) continue;
        function parseMoney(val) {
            if (!val) return 0;
            // Remove £, commas, spaces, and handle minus sign (hyphen or unicode)
            val = val.replace(/£|,/g, '').replace(/[−–—-]/, '-').replace(/\s/g, '');
            return parseFloat(val);
        }
        data.push({
            month: cells[idx['month']].trim(),
            beginning: parseMoney(cells[idx['beginning']]),
            purchases: parseMoney(cells[idx['purchases']]),
            marketGain: parseMoney(cells[idx['marketGain']]),
            income: parseMoney(cells[idx['income']]),
            fees: parseMoney(cells[idx['fees']]),
            ending: parseMoney(cells[idx['ending']]),
        });
    }
    if (!data.length) throw new Error('No valid data rows found.');
    return data;
}

function groupByYear(data) {
    const yearlyData = {};
    data.forEach(item => {
        const year = item.month.split(' ')[1];
        if (!yearlyData[year]) {
            yearlyData[year] = {
                year: year,
                months: [],
                totalContributions: 0,
                totalMarketGains: 0,
                totalIncome: 0,
                totalFees: 0,
                startBalance: null,
                endBalance: null
            };
        }
        yearlyData[year].months.push(item);
    });
    Object.keys(yearlyData).forEach(year => {
        const yearData = yearlyData[year];
        yearData.months.sort((a, b) => {
            const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return monthOrder.indexOf(a.month.split(' ')[0]) - monthOrder.indexOf(b.month.split(' ')[0]);
        });
        yearData.startBalance = yearData.months[0].beginning;
        yearData.endBalance = yearData.months[yearData.months.length - 1].ending;
        yearData.months.forEach(month => {
            yearData.totalContributions += month.purchases;
            yearData.totalMarketGains += month.marketGain;
            yearData.totalIncome += month.income;
            yearData.totalFees += month.fees;
        });
        yearData.totalReturns = yearData.totalMarketGains + yearData.totalIncome + yearData.totalFees;
        yearData.returnPercentage = ((yearData.totalReturns / (yearData.startBalance + yearData.totalContributions)) * 100);
    });
    return yearlyData;
}

