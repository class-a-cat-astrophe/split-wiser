// --- STATE ---
let state = {
    friends: [],
    expenses: [],
    baseCurrency: "SGD",
    localCurrency: "JPY",
    exchangeRate: 110, // 1 SGD = 110 JPY
    fetchDate: null,
    historicalRates: {}
};

let editingExpenseId = null; // Used for V2 Editing feature

// --- DOM ELEMENTS ---
const elements = {
    views: document.querySelectorAll('.view'),
    navBtns: document.querySelectorAll('.nav-btn'),
    appTitle: document.getElementById('app-title'),
    canvasHeader: document.getElementById('canvas-header'),
    toast: document.getElementById('toast'),
    
    // Settings
    settingBaseCurr: document.getElementById('setting-base-curr'),
    baseAmount: document.getElementById('base-amount'),
    settingLocalCurr: document.getElementById('setting-local-curr'),
    settingRate: document.getElementById('setting-rate'),
    btnFetchRate: document.getElementById('btn-fetch-rate'),
    newFriendName: document.getElementById('new-friend-name'),
    btnAddFriend: document.getElementById('btn-add-friend'),
    friendsList: document.getElementById('friends-list'),
    btnClearData: document.getElementById('btn-clear-data'),
    btnDownloadCsv: document.getElementById('btn-download-csv'),
    
    // Add Expense
    expCategory: document.getElementById('expense-category'),
    expDesc: document.getElementById('expense-desc'),
    btnGeolocate: document.getElementById('btn-geolocate'),
    expAmount: document.getElementById('expense-amount'),
    expCurrency: document.getElementById('expense-currency'),
    expPayer: document.getElementById('expense-payer'),
    splitCheckboxes: document.getElementById('split-checkboxes'),
    btnSaveExpense: document.getElementById('btn-save-expense'),
    btnCancelEdit: document.getElementById('btn-cancel-edit'),
    
    // Balances & History
    settlementsList: document.getElementById('settlements-list'),
    balancesList: document.getElementById('balances-list'),
    historyList: document.getElementById('history-list'),
    btnShareDash: document.getElementById('btn-share-dash'),
    dashboardArea: document.getElementById('dashboard-capture-area')
};

// --- INITIALIZATION ---
async function init() {
    loadState();
    bindEvents();
    renderAll();
    await checkAutoRefresh();
}

async function checkAutoRefresh() {
    const today = new Date().toLocaleDateString();
    if (state.fetchDate !== today && state.localCurrency !== "LOCAL") {
        await fetchLiveRate(true);
    }
}

let toastTimeout;
function showToast(msg, isError = false) {
    elements.toast.textContent = msg;
    if(isError) elements.toast.classList.add('toast-error');
    else elements.toast.classList.remove('toast-error');
    
    elements.toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

// --- STORAGE ---
function saveState() {
    localStorage.setItem('tripSplitterState', JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem('tripSplitterState');
    if (saved) {
        state = JSON.parse(saved);
        if (!state.expenses) state.expenses = [];
        if (!state.friends) state.friends = [];
        if (!state.historicalRates) state.historicalRates = {};
    }
}

// --- NAVIGATION & EVENTS ---
function bindEvents() {
    elements.navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const targetId = btn.getAttribute('data-target');
            elements.views.forEach(v => v.classList.remove('active-view'));
            document.getElementById(targetId).classList.add('active-view');
            
            // If navigating away from add-expense, cancel any edit mode seamlessly
            if (targetId !== 'view-add-expense' && editingExpenseId) cancelEditMode(); 
            
            if (targetId === 'view-balances') renderBalances();
            if (targetId === 'view-history') renderHistory();
            if (targetId === 'view-add-expense') renderAddExpenseForm();
        });
    });
    
    // Settings
    elements.btnAddFriend.addEventListener('click', addFriend);
    elements.newFriendName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addFriend();
    });
    elements.settingBaseCurr.addEventListener('change', async (e) => {
        state.baseCurrency = e.target.value.toUpperCase() || "SGD";
        e.target.value = state.baseCurrency;
        saveAndRender();
        await fetchLiveRate(true);
    });
    elements.settingLocalCurr.addEventListener('change', async (e) => {
        state.localCurrency = e.target.value.toUpperCase() || "LOCAL";
        renderAddExpenseForm();
        saveAndRender();
        if (state.localCurrency !== "LOCAL") await fetchLiveRate(true);
    });
    
    // Dynamic Calculator
    elements.baseAmount.addEventListener('input', (e) => {
        const baseVal = parseFloat(e.target.value) || 0;
        if(baseVal > 0) {
            elements.settingRate.value = +(baseVal * state.exchangeRate).toFixed(4);
        }
    });

    elements.settingRate.addEventListener('change', (e) => {
        const localVal = parseFloat(e.target.value) || 0;
        const baseVal = parseFloat(elements.baseAmount.value) || 1;
        if(baseVal > 0 && localVal > 0) {
            state.exchangeRate = localVal / baseVal;
            const today = new Date().toLocaleDateString();
            state.historicalRates[today] = state.exchangeRate;
            saveAndRender();
        }
    });
    
    elements.btnFetchRate.addEventListener('click', () => fetchLiveRate(false));
    elements.btnDownloadCsv.addEventListener('click', downloadCSV);
    elements.btnClearData.addEventListener('click', triggerHardWipe);
    
    // Add Expense / Edit functionality
    elements.btnSaveExpense.addEventListener('click', saveExpense);
    elements.btnCancelEdit.addEventListener('click', cancelEditMode);
    elements.btnGeolocate.addEventListener('click', autoFetchLocation);
    
    // Sharing
    elements.btnShareDash.addEventListener('click', shareDashboardImage);
}

// --- LOGIC: FRIENDS & SETTINGS ---
function addFriend() {
    const name = elements.newFriendName.value.trim();
    if (!name) {
        return showToast("Error: Please enter a name.", true);
    }
    if (state.friends.some(f => f.toLowerCase() === name.toLowerCase())) {
        return showToast("Error: That person is already in the trip!", true);
    }
    state.friends.push(name);
    elements.newFriendName.value = '';
    saveAndRender();
    showToast(`${name} was added to the trip!`);
}

function removeFriend(name) {
    if (confirm(`Remove ${name} from the trip list?`)) {
        state.friends = state.friends.filter(f => f !== name);
        saveAndRender();
    }
}

async function fetchLiveRate(isAuto = false) {
    if(!state.localCurrency || state.localCurrency === "LOCAL") {
        if(!isAuto) showToast("Error: Select a valid currency code first!", true);
        return;
    }
    if(!isAuto) elements.btnFetchRate.textContent = "⌛ Fetching...";
    try {
        const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${state.baseCurrency}`);
        const data = await res.json();
        const rate = data.rates[state.localCurrency];
        if (rate) {
            state.exchangeRate = rate;
            const today = new Date().toLocaleDateString();
            state.fetchDate = today;
            state.historicalRates[today] = rate;
            
            const baseVal = parseFloat(elements.baseAmount.value) || 1;
            elements.settingRate.value = +(baseVal * rate).toFixed(4);
            
            saveAndRender();
            if(!isAuto) showToast(`Live mapped to exactly ${rate}`);
        } else {
            if(!isAuto) showToast(`Error: ${state.localCurrency} is not supported.`, true);
        }
    } catch(err) {
        if(!isAuto) showToast("Error: API unavailable.", true);
    }
    if(!isAuto) elements.btnFetchRate.textContent = "Fetch Live Rate";
}

// HARDENED WIPE (V2)
function triggerHardWipe() {
    const word = prompt("🧨 DANGER: This wipes all trip data permanently. Type 'DELETE' to confirm:");
    if (word && word.toUpperCase() === "DELETE") {
        localStorage.removeItem('tripSplitterState');
        state = { friends: [], expenses: [], baseCurrency: "SGD", localCurrency: "LOCAL", exchangeRate: 1, fetchDate: null, historicalRates: {} };
        editingExpenseId = null;
        saveAndRender();
        alert("Data wiped.");
    } else if (word !== null) {
        alert("Invalid word. Wipe cancelled.");
    }
}

// CSV EXPORT (V2)
function downloadCSV() {
    if (state.expenses.length === 0) return alert("Nothing to download yet!");
    let csv = "Date,Description,Payer,Amount,Currency,AmountInSGD,SplitAmong\n";
    state.expenses.forEach(exp => {
        const dateStr = new Date(exp.date).toLocaleDateString();
        // Wrap strings in quotes to prevent issue with commas within description
        const splitNames = exp.splitAmong.join(' & ');
        csv += `"${dateStr}","${exp.desc}","${exp.payer}",${exp.amount},"${exp.currency}",${exp.amountSGD.toFixed(2)},"${splitNames}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "Trip_Splitter_Log.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// GEOLOCATION AUTO FILL (V2)
function autoFetchLocation() {
    if (!navigator.geolocation) return alert("Geolocation not supported by your browser");
    
    elements.expDesc.placeholder = "Locating...";
    elements.btnGeolocate.textContent = "⌛";
    
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await res.json();
            
            // Build the most reasonable place name available
            let placeName = data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.county || "";
            let context = data.address.country || data.address.state || "";
            
            let result = placeName ? `${placeName}, ${context}` : context;
            if (result) elements.expDesc.value = `Expense in ${result}`;
            
        } catch(e) {
            elements.expDesc.placeholder = "Failed to grab location";
        }
        elements.btnGeolocate.textContent = "📍";
    }, (error) => {
        alert("Location access denied or failed.");
        elements.btnGeolocate.textContent = "📍";
        elements.expDesc.placeholder = "Dinner at Shibuya";
    });
}

// HTML2CANVAS SHARE FEATURE (V2)
async function shareDashboardImage() {
    elements.btnShareDash.textContent = "⌛ Building...";
    elements.canvasHeader.style.display = 'block'; // Make title visible specifically for capture
    
    try {
        const canvas = await html2canvas(elements.dashboardArea, {
            backgroundColor: '#1e293b',
            scale: 2 // High res
        });
        
        elements.canvasHeader.style.display = 'none'; // hide title again for standard web view padding
        
        canvas.toBlob(async (blob) => {
            const file = new File([blob], "trip_dashboard.png", { type: "image/png" });
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'Trip Settlement Dashboard',
                    text: 'Here are the current balances for our trip!',
                    files: [file]
                });
            } else {
                // Fallback for browsers that don't support Web Share API with files
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "trip_settlement_snapshot.png";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                alert("Your browser doesn't support direct sharing, so we downloaded the image to your device for you to attach manually!");
            }
        });
    } catch(err) {
        alert("Failed to build image. Check console.");
        console.error(err);
    }
    
    elements.btnShareDash.textContent = "📸 Share Image";
    elements.canvasHeader.style.display = 'none';
}


// --- LOGIC: ADD/EDIT EXPENSE (V2 Upgraded) ---
function saveExpense() {
    const category = elements.expCategory.value;
    const desc = elements.expDesc.value.trim();
    const amount = parseFloat(elements.expAmount.value);
    const currency = elements.expCurrency.value; // "LOCAL" or "SGD"
    let payer = elements.expPayer.value;
    
    const checked = [];
    document.querySelectorAll('.split-check').forEach(cb => {
        if(cb.checked) checked.push(cb.value);
    });
    
    if (!category || isNaN(amount) || !currency) {
        showToast("Error: Category, Amount, & Currency are required (*)", true);
        return;
    }
    
    if (checked.length === 0) {
        showToast("Error: Please include at least one person to split with.", true);
        return;
    }
    
    if (!payer) {
        payer = state.friends.length > 0 ? state.friends[0] : "Unknown";
    }
    
    const amountSGD = currency === "SGD" ? amount : (amount / state.exchangeRate);
    
    const expObj = {
        id: editingExpenseId || Date.now().toString(),
        category,
        desc,
        amount,
        currency: currency === "SGD" ? "SGD" : state.localCurrency,
        amountSGD,
        rateSnapshot: state.exchangeRate,
        payer,
        splitAmong: checked,
        date: new Date().toISOString()
    };
    
    if (editingExpenseId) {
        const index = state.expenses.findIndex(e => e.id === editingExpenseId);
        if(index !== -1) state.expenses[index] = expObj;
    } else {
        state.expenses.push(expObj);
    }
    
    saveState();
    cancelEditMode(); // Clears form
    showToast("Expense correctly mapped & saved!");
}

function setupEditExpense(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (!exp) return;
    
    editingExpenseId = exp.id;
    
    // Jump to add view
    document.querySelector('[data-target="view-add-expense"]').click();
    
    if (exp.category) elements.expCategory.value = exp.category;
    elements.expDesc.value = exp.desc;
    elements.expAmount.value = exp.amount;
    elements.expCurrency.value = exp.currency === "SGD" ? "SGD" : "LOCAL";
    
    renderAddExpenseForm(); // recreate selects/checkboxes
    elements.expPayer.value = exp.payer;
    
    document.querySelectorAll('.split-check').forEach(cb => {
        cb.checked = exp.splitAmong.includes(cb.value);
    });
    
    elements.btnSaveExpense.textContent = "Update Expense";
    elements.btnCancelEdit.style.display = "block";
}

function cancelEditMode() {
    editingExpenseId = null;
    elements.expDesc.value = '';
    elements.expAmount.value = '';
    elements.btnSaveExpense.textContent = "Save Expense";
    elements.btnCancelEdit.style.display = "none";
    renderAddExpenseForm();
}


// --- CALCULATIONS ---
function calculateBalances() {
    let balances = {};
    state.friends.forEach(f => balances[f] = 0);
    
    state.expenses.forEach(exp => {
        if (balances[exp.payer] === undefined) balances[exp.payer] = 0;
        balances[exp.payer] += exp.amountSGD;
        
        const splitAmount = exp.amountSGD / exp.splitAmong.length;
        exp.splitAmong.forEach(person => {
            if (balances[person] === undefined) balances[person] = 0;
            balances[person] -= splitAmount;
        });
    });
    
    return balances;
}

function calculateSettlements(balances) {
    let debtors = [];
    let creditors = [];
    
    for (const [person, amt] of Object.entries(balances)) {
        if (amt < -0.01) debtors.push({ person, amt: Math.abs(amt) });
        if (amt > 0.01) creditors.push({ person, amt });
    }
    
    debtors.sort((a,b) => b.amt - a.amt);
    creditors.sort((a,b) => b.amt - a.amt);
    
    let settlements = [];
    let i = 0, j = 0;
    
    while(i < debtors.length && j < creditors.length) {
        let debtor = debtors[i];
        let creditor = creditors[j];
        
        let minAmt = Math.min(debtor.amt, creditor.amt);
        settlements.push({ from: debtor.person, to: creditor.person, amount: minAmt });
        
        debtor.amt -= minAmt;
        creditor.amt -= minAmt;
        
        if (debtor.amt < 0.01) i++;
        if (creditor.amt < 0.01) j++;
    }
    return settlements;
}

// --- RENDERERS ---
function renderAll() {
    elements.canvasHeader.style.display = 'none'; // ensure off in init
    
    elements.settingLocalCurr.value = state.localCurrency === "LOCAL" ? "" : state.localCurrency;
    elements.settingBaseCurr.value = state.baseCurrency;
    
    const currentBase = parseFloat(elements.baseAmount.value) || 1;
    elements.settingRate.value = +(currentBase * state.exchangeRate).toFixed(4);
    
    elements.friendsList.innerHTML = '';
    state.friends.forEach(f => {
        const li = document.createElement('li');
        li.className = 'pill';
        li.innerHTML = `<span>${f}</span><button onclick="removeFriend('${f}')">&times;</button>`;
        elements.friendsList.appendChild(li);
    });
    
    if(!editingExpenseId) {
       renderAddExpenseForm();
    }
    
    renderBalances();
    renderHistory();
}

function saveAndRender() {
    saveState();
    renderAll();
}

function renderAddExpenseForm() {
    elements.expCurrency.options[0].text = state.localCurrency !== "LOCAL" ? state.localCurrency : "Local Currency";
    
    const selectedPayer = elements.expPayer.value;
    elements.expPayer.innerHTML = '';
    elements.splitCheckboxes.innerHTML = '';
    
    state.friends.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        elements.expPayer.appendChild(opt);
        
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        label.innerHTML = `<input type="checkbox" class="split-check" value="${f}" checked> <span>${f}</span>`;
        elements.splitCheckboxes.appendChild(label);
    });

    if (selectedPayer && state.friends.includes(selectedPayer)) {
        elements.expPayer.value = selectedPayer;
    }
}

function renderBalances() {
    const balances = calculateBalances();
    const settlements = calculateSettlements(balances);
    
    const subtitle = document.getElementById('settle-subtitle');
    if(subtitle) subtitle.innerHTML = `Debts anchored in <strong>${state.baseCurrency}</strong>. Cash equivalents use active rate.`;
    
    elements.balancesList.innerHTML = '';
    for (const [person, amt] of Object.entries(balances)) {
        if (Math.abs(amt) > 0.01) {
            const li = document.createElement('li');
            const isOwed = amt > 0;
            const absoluteAmt = Math.abs(amt);
            const localAmt = (absoluteAmt * state.exchangeRate).toFixed(0); // usually local cash doesn't need pennies, or .toFixed(2) depending on bounds.
            const localString = state.localCurrency === "LOCAL" ? '' : `<div style="font-size:0.75rem; color:var(--text-secondary); font-weight:400;">~ ${parseFloat(localAmt).toLocaleString()} ${state.localCurrency}</div>`;

            li.innerHTML = `
                <span>${person}</span>
                <span class="${isOwed ? 'gets' : 'owes'}" style="text-align:right;">
                    <div>${isOwed ? '+' : ''}${absoluteAmt.toFixed(2)} ${state.baseCurrency}</div>
                    ${localString}
                </span>
            `;
            elements.balancesList.appendChild(li);
        }
    }
    if (elements.balancesList.innerHTML === '') elements.balancesList.innerHTML = '<li><span style="color:var(--text-secondary)">Everyone is evenly balanced!</span></li>';
    
    elements.settlementsList.innerHTML = '';
    settlements.forEach(s => {
        const li = document.createElement('li');
        const localSettle = (s.amount * state.exchangeRate).toFixed(0);
        const localString = state.localCurrency === "LOCAL" ? '' : `<div style="font-size:0.75rem; color:var(--text-secondary); font-weight:400;">or ${parseFloat(localSettle).toLocaleString()} ${state.localCurrency}</div>`;

        li.innerHTML = `
            <span><strong>${s.from}</strong> <svg style="width:16px;height:16px;vertical-align:middle;margin:0 4px;color:var(--text-secondary)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg> <strong>${s.to}</strong></span>
            <span class="owes" style="text-align:right;">
                <div>${s.amount.toFixed(2)} ${state.baseCurrency}</div>
                ${localString}
            </span>
        `;
        elements.settlementsList.appendChild(li);
    });
    if (elements.settlementsList.innerHTML === '') elements.settlementsList.innerHTML = '<li><span style="color:var(--text-secondary)">No payments needed.</span></li>';
}

// Global hook for the onclick attribute
window.setupEditExpense = setupEditExpense;
window.removeFriend = removeFriend;

function renderHistory() {
    elements.historyList.innerHTML = '';
    const rev = [...state.expenses].reverse();
    rev.forEach(exp => {
        const li = document.createElement('li');
        const dateStr = new Date(exp.date).toLocaleDateString();
        const catLabel = exp.category ? `[${exp.category}] ` : '';
        const localCode = exp.currency !== "SGD" ? exp.currency : state.localCurrency;
        const rateLabel = exp.rateSnapshot ? `<br><span style="font-size:0.75rem; color:var(--text-secondary);">Applied Rate: 1 SGD = ${exp.rateSnapshot} ${localCode}</span>` : '';
        li.innerHTML = `
            <div class="history-item-left" style="flex:1">
                <div class="title"><span style="color:var(--accent); font-size:0.85rem; margin-right:4px;">${catLabel}</span>${exp.desc}</div>
                <div class="meta">${exp.payer} paid • ${dateStr} ${rateLabel}</div>
            </div>
            <div class="history-item-right" style="margin-right:12px;">
                <div style="font-size: 0.95rem;">${exp.amount.toFixed(2)} ${exp.currency}</div>
            </div>
            <button class="btn secondary-btn" style="width:auto; padding:6px 12px; font-size:0.75rem;" onclick="setupEditExpense('${exp.id}')">Edit</button>
        `;
        elements.historyList.appendChild(li);
    });
    if (elements.historyList.innerHTML === '') elements.historyList.innerHTML = '<li style="color:var(--text-secondary);">No expenses logged yet.</li>';
}

init();
