const DEFAULT_STATE = {
    friends: [],
    expenses: [],
    baseCurrency: "SGD",
    localCurrency: "JPY",
    exchangeRate: 110,
    fetchDate: null,
    historicalRates: {},
    hasSeenOnboarding: false,
    lastSharedAt: null,
    lastShareReminderDate: null
};

let state = structuredClone(DEFAULT_STATE);
let editingExpenseId = null;
let editingOriginalDate = null;

const elements = {
    views: document.querySelectorAll('.view'),
    navBtns: document.querySelectorAll('.nav-btn'),
    appTitle: document.getElementById('app-title'),
    canvasHeader: document.getElementById('canvas-header'),
    toast: document.getElementById('toast'),
    onboardingOverlay: document.getElementById('onboarding-overlay'),
    btnOpenOnboarding: document.getElementById('btn-open-onboarding'),
    btnCloseOnboarding: document.getElementById('btn-close-onboarding'),
    btnOnboardingDone: document.getElementById('btn-onboarding-done'),
    btnOnboardingGoSettings: document.getElementById('btn-onboarding-go-settings'),

    settingBaseCurr: document.getElementById('setting-base-curr'),
    baseAmount: document.getElementById('base-amount'),
    settingLocalCurr: document.getElementById('setting-local-curr'),
    settingRate: document.getElementById('setting-rate'),
    btnSwapCurrencies: document.getElementById('btn-swap-currencies'),
    btnFetchRate: document.getElementById('btn-fetch-rate'),
    newFriendName: document.getElementById('new-friend-name'),
    btnAddFriend: document.getElementById('btn-add-friend'),
    friendsList: document.getElementById('friends-list'),
    btnClearData: document.getElementById('btn-clear-data'),
    btnDownloadCsv: document.getElementById('btn-download-csv'),

    expCategory: document.getElementById('expense-category'),
    expDesc: document.getElementById('expense-desc'),
    btnGeolocate: document.getElementById('btn-geolocate'),
    expAmount: document.getElementById('expense-amount'),
    expCurrency: document.getElementById('expense-currency'),
    expPayer: document.getElementById('expense-payer'),
    splitCheckboxes: document.getElementById('split-checkboxes'),
    btnSaveExpense: document.getElementById('btn-save-expense'),
    btnCancelEdit: document.getElementById('btn-cancel-edit'),

    settlementsList: document.getElementById('settlements-list'),
    balancesList: document.getElementById('balances-list'),
    historyList: document.getElementById('history-list'),
    btnShareDash: document.getElementById('btn-share-dash'),
    dashboardArea: document.getElementById('dashboard-capture-area')
};

async function init() {
    loadState();
    bindEvents();
    renderAll();
    maybeShowOnboarding();
    await checkAutoRefresh();
}

async function checkAutoRefresh() {
    const today = new Date().toLocaleDateString();
    if (state.fetchDate !== today && state.localCurrency) {
        await fetchLiveRate(true);
    }
}

let toastTimeout;
function showToast(message, isError = false) {
    elements.toast.textContent = message;
    elements.toast.classList.toggle('toast-error', isError);
    elements.toast.classList.add('show');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

function normalizeCurrencyCode(value, fallback = "") {
    return (value || fallback || "").trim().toUpperCase();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function numberOrFallback(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value, digits = 2) {
    return parseFloat(Number(value).toFixed(digits)).toString();
}

function saveState() {
    localStorage.setItem('tripSplitterState', JSON.stringify(state));
}

function loadState() {
    try {
        const saved = localStorage.getItem('tripSplitterState');
        if (!saved) {
            state = structuredClone(DEFAULT_STATE);
            return;
        }

        const parsed = JSON.parse(saved);
        state = migrateState(parsed);
        saveState();
    } catch (error) {
        console.error("Failed to load state:", error);
        state = structuredClone(DEFAULT_STATE);
    }
}

function migrateState(rawState) {
    const baseCurrency = normalizeCurrencyCode(rawState.baseCurrency, DEFAULT_STATE.baseCurrency);
    const localCurrency = normalizeCurrencyCode(rawState.localCurrency, DEFAULT_STATE.localCurrency);
    const exchangeRate = numberOrFallback(rawState.exchangeRate, DEFAULT_STATE.exchangeRate);

    return {
        friends: Array.isArray(rawState.friends) ? rawState.friends.map(name => String(name).trim()).filter(Boolean) : [],
        expenses: Array.isArray(rawState.expenses)
            ? rawState.expenses.map(expense => migrateExpense(expense, { baseCurrency, localCurrency, exchangeRate }))
            : [],
        baseCurrency,
        localCurrency,
        exchangeRate,
        fetchDate: rawState.fetchDate || null,
        historicalRates: rawState.historicalRates && typeof rawState.historicalRates === "object"
            ? rawState.historicalRates
            : {},
        hasSeenOnboarding: Boolean(rawState.hasSeenOnboarding),
        lastSharedAt: rawState.lastSharedAt || null,
        lastShareReminderDate: rawState.lastShareReminderDate || null
    };
}

function migrateExpense(rawExpense, context) {
    const amount = numberOrFallback(rawExpense.amount, 0);
    const rateSnapshot = numberOrFallback(rawExpense.rateSnapshot, context.exchangeRate || 1);
    const baseCurrencySnapshot = normalizeCurrencyCode(
        rawExpense.baseCurrencySnapshot,
        context.baseCurrency
    );
    const localCurrencySnapshot = normalizeCurrencyCode(
        rawExpense.localCurrencySnapshot,
        context.localCurrency
    );
    const currency = normalizeCurrencyCode(rawExpense.currency, baseCurrencySnapshot);

    let amountBase = numberOrFallback(rawExpense.amountBase, NaN);
    if (!Number.isFinite(amountBase)) {
        amountBase = numberOrFallback(rawExpense.amountSGD, NaN);
    }
    if (!Number.isFinite(amountBase)) {
        amountBase = currency === baseCurrencySnapshot ? amount : amount / Math.max(rateSnapshot, 1e-9);
    }

    return {
        id: rawExpense.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        category: rawExpense.category || "Shopping & Misc",
        desc: rawExpense.desc || "",
        amount,
        currency,
        amountBase,
        rateSnapshot,
        baseCurrencySnapshot,
        localCurrencySnapshot,
        payer: rawExpense.payer || "",
        splitAmong: Array.isArray(rawExpense.splitAmong) ? rawExpense.splitAmong.map(String) : [],
        date: rawExpense.date || new Date().toISOString()
    };
}

function bindEvents() {
    elements.navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            openView(targetId);
        });
    });

    elements.btnAddFriend.addEventListener('click', addFriend);
    elements.newFriendName.addEventListener('keypress', event => {
        if (event.key === 'Enter') addFriend();
    });

    elements.settingBaseCurr.addEventListener('change', event => {
        const nextBaseCurrency = normalizeCurrencyCode(event.target.value, state.baseCurrency || DEFAULT_STATE.baseCurrency);
        state.baseCurrency = nextBaseCurrency || DEFAULT_STATE.baseCurrency;
        event.target.value = state.baseCurrency;
        saveAndRender();
        fetchLiveRate(true);
    });

    elements.settingLocalCurr.addEventListener('change', event => {
        state.localCurrency = normalizeCurrencyCode(event.target.value, state.localCurrency || DEFAULT_STATE.localCurrency);
        event.target.value = state.localCurrency;
        renderAddExpenseForm();
        saveAndRender();
        fetchLiveRate(true);
    });

    elements.baseAmount.addEventListener('input', event => {
        const baseValue = numberOrFallback(event.target.value, 0);
        if (baseValue > 0) {
            elements.settingRate.value = (baseValue * state.exchangeRate).toFixed(4).replace(/\.?0+$/, "");
        }
    });

    elements.settingRate.addEventListener('change', event => {
        const localValue = numberOrFallback(event.target.value, 0);
        const baseValue = numberOrFallback(elements.baseAmount.value, 1);

        if (baseValue > 0 && localValue > 0) {
            state.exchangeRate = localValue / baseValue;
            const today = new Date().toLocaleDateString();
            state.historicalRates[today] = state.exchangeRate;
            saveAndRender();
        }
    });

    elements.btnSwapCurrencies.addEventListener('click', swapCurrencies);
    elements.btnFetchRate.addEventListener('click', () => fetchLiveRate(false));
    elements.btnDownloadCsv.addEventListener('click', downloadCSV);
    elements.btnClearData.addEventListener('click', triggerHardWipe);

    elements.btnSaveExpense.addEventListener('click', saveExpense);
    elements.btnCancelEdit.addEventListener('click', cancelEditMode);
    elements.btnGeolocate.addEventListener('click', autoFetchLocation);
    elements.btnOpenOnboarding.addEventListener('click', () => openOnboarding(false));
    elements.btnCloseOnboarding.addEventListener('click', closeOnboarding);
    elements.btnOnboardingDone.addEventListener('click', closeOnboarding);
    elements.btnOnboardingGoSettings.addEventListener('click', () => {
        closeOnboarding();
        openView('view-settings');
    });
    elements.onboardingOverlay.addEventListener('click', event => {
        if (event.target === elements.onboardingOverlay) closeOnboarding();
    });

    elements.friendsList.addEventListener('click', event => {
        const button = event.target.closest('[data-remove-friend]');
        if (!button) return;
        removeFriend(button.getAttribute('data-remove-friend'));
    });

    elements.historyList.addEventListener('click', event => {
        const actionButton = event.target.closest('[data-action]');
        if (!actionButton) return;

        const expenseId = actionButton.getAttribute('data-expense-id');
        if (actionButton.getAttribute('data-action') === 'edit') {
            setupEditExpense(expenseId);
        }
        if (actionButton.getAttribute('data-action') === 'delete') {
            deleteExpense(expenseId);
        }
    });

    elements.btnShareDash.addEventListener('click', shareDashboardImage);
}

function addFriend() {
    const name = elements.newFriendName.value.trim();
    if (!name) {
        showToast("Error: Please enter a name.", true);
        return;
    }

    if (state.friends.some(friend => friend.toLowerCase() === name.toLowerCase())) {
        showToast("Error: That person is already in the trip.", true);
        return;
    }

    state.friends.push(name);
    elements.newFriendName.value = '';
    saveAndRender();
    showToast(`${name} joined the trip.`);
}

function removeFriend(name) {
    if (!name) return;

    const isReferenced = state.expenses.some(expense =>
        expense.payer === name || expense.splitAmong.includes(name)
    );

    if (isReferenced) {
        showToast("Edit or delete related expenses before removing that friend.", true);
        return;
    }

    if (confirm(`Remove ${name} from the trip list?`)) {
        state.friends = state.friends.filter(friend => friend !== name);
        saveAndRender();
        showToast(`${name} was removed from this trip.`);
    }
}

async function fetchLiveRate(isAuto = false) {
    if (!state.localCurrency) {
        if (!isAuto) showToast("Error: Set a local currency first.", true);
        return;
    }

    if (!isAuto) {
        elements.btnFetchRate.textContent = "⌛ Fetching...";
        elements.btnFetchRate.disabled = true;
    }

    try {
        const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${state.baseCurrency}`);
        const data = await response.json();
        const rate = data?.rates?.[state.localCurrency];

        if (!Number.isFinite(rate)) {
            throw new Error("Unsupported currency");
        }

        state.exchangeRate = rate;
        const today = new Date().toLocaleDateString();
        state.fetchDate = today;
        state.historicalRates[today] = rate;

        const baseValue = numberOrFallback(elements.baseAmount.value, 1);
        elements.settingRate.value = (baseValue * rate).toFixed(4).replace(/\.?0+$/, "");

        saveAndRender();
        if (!isAuto) showToast(`Live rate updated: 1 ${state.baseCurrency} = ${rate} ${state.localCurrency}`);
    } catch (error) {
        console.error("Failed to fetch live rate:", error);
        if (!isAuto) showToast("Error: Live exchange rate unavailable.", true);
    } finally {
        if (!isAuto) {
            elements.btnFetchRate.textContent = "Fetch Live Rate";
            elements.btnFetchRate.disabled = false;
        }
    }
}

function triggerHardWipe() {
    const confirmation = prompt("Delete all trip data? Type DELETE to confirm:");
    if (confirmation && confirmation.toUpperCase() === "DELETE") {
        localStorage.removeItem('tripSplitterState');
        state = structuredClone(DEFAULT_STATE);
        editingExpenseId = null;
        editingOriginalDate = null;
        saveAndRender();
        alert("All trip data was removed.");
    } else if (confirmation !== null) {
        alert("Invalid word. Wipe cancelled.");
    }
}

function maybeShowOnboarding() {
    if (!state.hasSeenOnboarding) {
        openOnboarding(true);
    }
}

function openOnboarding(markAsSeen = false) {
    elements.onboardingOverlay.classList.remove('hidden');
    if (markAsSeen && !state.hasSeenOnboarding) {
        state.hasSeenOnboarding = true;
        saveState();
    }
}

function closeOnboarding() {
    elements.onboardingOverlay.classList.add('hidden');
}

function openView(targetId) {
    elements.navBtns.forEach(button => {
        button.classList.toggle('active', button.getAttribute('data-target') === targetId);
    });
    elements.views.forEach(view => {
        view.classList.toggle('active-view', view.id === targetId);
    });

    if (targetId !== 'view-add-expense' && editingExpenseId) {
        cancelEditMode();
    }

    if (targetId === 'view-balances') {
        renderBalances();
        maybeRemindDailyShare();
    }
    if (targetId === 'view-history') renderHistory();
    if (targetId === 'view-add-expense') renderAddExpenseForm();
}

function getTodayKey() {
    return new Date().toLocaleDateString();
}

function getTodayExpenseCount() {
    const todayKey = getTodayKey();
    return state.expenses.filter(expense =>
        new Date(expense.date).toLocaleDateString() === todayKey
    ).length;
}

function hasSharedToday() {
    if (!state.lastSharedAt) return false;
    return new Date(state.lastSharedAt).toLocaleDateString() === getTodayKey();
}

function maybeRemindDailyShare() {
    const todayKey = getTodayKey();
    const todayExpenseCount = getTodayExpenseCount();

    if (todayExpenseCount < 5) return;
    if (hasSharedToday()) return;
    if (state.lastShareReminderDate === todayKey) return;

    state.lastShareReminderDate = todayKey;
    saveState();
    showToast("Daily tip: Share today’s balance with your group for transparency.");
}

function swapCurrencies() {
    const currentBaseAmount = numberOrFallback(elements.baseAmount.value, 1);
    const currentLocalAmount = numberOrFallback(elements.settingRate.value, currentBaseAmount * state.exchangeRate);
    const previousBaseCurrency = state.baseCurrency;

    state.baseCurrency = state.localCurrency || previousBaseCurrency;
    state.localCurrency = previousBaseCurrency;

    if (Number.isFinite(state.exchangeRate) && state.exchangeRate > 0) {
        state.exchangeRate = 1 / state.exchangeRate;
    }

    elements.baseAmount.value = formatNumber(currentLocalAmount, 4);
    elements.settingRate.value = formatNumber(currentBaseAmount, 4);
    elements.settingBaseCurr.value = state.baseCurrency;
    elements.settingLocalCurr.value = state.localCurrency;

    saveAndRender();
    showToast(`Swapped ${state.localCurrency} and ${state.baseCurrency}.`);
}

function getExpenseAmountInSelectedBase(expense) {
    const storedAmountBase = numberOrFallback(expense.amountBase, 0);
    const snapshotBaseCurrency = expense.baseCurrencySnapshot || state.baseCurrency;

    if (snapshotBaseCurrency === state.baseCurrency) {
        return storedAmountBase;
    }

    const snapshotRate = numberOrFallback(expense.rateSnapshot, NaN);
    const currentRate = numberOrFallback(state.exchangeRate, NaN);

    if (Number.isFinite(snapshotRate) && snapshotRate > 0 && Number.isFinite(currentRate) && currentRate > 0) {
        return storedAmountBase * (snapshotRate / currentRate);
    }

    return storedAmountBase;
}

function getCurrentBaseAmountLabel(expense) {
    return `${getExpenseAmountInSelectedBase(expense).toFixed(2)} ${state.baseCurrency}`;
}

function downloadCSV() {
    if (state.expenses.length === 0) {
        alert("Nothing to download yet.");
        return;
    }

    const baseHeader = `AmountIn${state.baseCurrency}`;
    let csv = `Date,Description,Payer,OriginalAmount,OriginalCurrency,${baseHeader},SplitAmong,RateSnapshot\n`;

    state.expenses.forEach(expense => {
        const dateString = new Date(expense.date).toLocaleDateString();
        const splitNames = expense.splitAmong.join(' & ');
        const snapshotLabel = `1 ${expense.baseCurrencySnapshot} = ${expense.rateSnapshot} ${expense.localCurrencySnapshot}`;
        const currentBaseAmount = getExpenseAmountInSelectedBase(expense).toFixed(2);

        csv += `"${dateString}","${expense.desc.replace(/"/g, '""')}","${expense.payer.replace(/"/g, '""')}",${expense.amount},"${expense.currency}",${currentBaseAmount},"${splitNames.replace(/"/g, '""')}","${snapshotLabel}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = "Trip_Splitter_Log.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function autoFetchLocation() {
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        return;
    }

    elements.expDesc.placeholder = "Locating...";
    elements.btnGeolocate.textContent = "⌛";
    elements.btnGeolocate.disabled = true;

    navigator.geolocation.getCurrentPosition(async position => {
        const { latitude, longitude } = position.coords;

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await response.json();
            const address = data.address || {};

            const placeName = address.city || address.town || address.village || address.suburb || address.county || "";
            const context = address.country || address.state || "";
            const result = placeName ? `${placeName}, ${context}` : context;

            if (result) {
                elements.expDesc.value = `Expense in ${result}`;
            }
        } catch (error) {
            console.error("Failed to reverse geocode:", error);
            elements.expDesc.placeholder = "Could not fill location";
        } finally {
            elements.btnGeolocate.textContent = "📍";
            elements.btnGeolocate.disabled = false;
        }
    }, () => {
        alert("Location access denied or unavailable.");
        elements.btnGeolocate.textContent = "📍";
        elements.btnGeolocate.disabled = false;
        elements.expDesc.placeholder = "Dinner at Shibuya";
    });
}

async function shareDashboardImage() {
    const sharedAt = new Date().toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
    elements.btnShareDash.textContent = "⌛ Building...";
    elements.btnShareDash.disabled = true;
    elements.canvasHeader.style.display = 'block';

    try {
        const canvas = await html2canvas(elements.dashboardArea, {
            backgroundColor: '#1e293b',
            scale: 2
        });

        elements.canvasHeader.style.display = 'none';

        canvas.toBlob(async blob => {
            if (!blob) {
                alert("Failed to build image.");
                return;
            }

            const file = new File([blob], "trip_dashboard.png", { type: "image/png" });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'Trip Settlement Dashboard',
                    text: `Here are the current balances for our trip. Shared on ${sharedAt}.`,
                    files: [file]
                });
                state.lastSharedAt = new Date().toISOString();
                state.lastShareReminderDate = getTodayKey();
                saveState();
            } else {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = "trip_settlement_snapshot.png";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                state.lastSharedAt = new Date().toISOString();
                state.lastShareReminderDate = getTodayKey();
                saveState();
                alert("Your browser downloaded the image so you can share it manually.");
            }
        });
    } catch (error) {
        console.error(error);
        alert("Failed to build image. Check the console for details.");
    } finally {
        elements.btnShareDash.textContent = "📸 Share Image";
        elements.btnShareDash.disabled = false;
        elements.canvasHeader.style.display = 'none';
    }
}

function saveExpense() {
    const isEditing = Boolean(editingExpenseId);
    const category = elements.expCategory.value;
    const desc = elements.expDesc.value.trim();
    const amount = numberOrFallback(elements.expAmount.value, NaN);
    const currencyMode = elements.expCurrency.value;
    let payer = elements.expPayer.value;

    const splitAmong = [];
    document.querySelectorAll('.split-check').forEach(checkbox => {
        if (checkbox.checked) splitAmong.push(checkbox.value);
    });

    if (!state.friends.length) {
        showToast("Error: Add at least one friend first.", true);
        return;
    }

    if (!category || !Number.isFinite(amount) || amount <= 0 || !currencyMode) {
        showToast("Error: Category, amount, and currency are required.", true);
        return;
    }

    if (splitAmong.length === 0) {
        showToast("Error: Include at least one friend in the split.", true);
        return;
    }

    if (!payer) {
        payer = state.friends[0];
    }

    const currency = currencyMode === "BASE" ? state.baseCurrency : state.localCurrency;
    const rateSnapshot = numberOrFallback(state.exchangeRate, 1);
    const amountBase = currencyMode === "BASE" ? amount : amount / Math.max(rateSnapshot, 1e-9);

    const expense = {
        id: editingExpenseId || Date.now().toString(),
        category,
        desc,
        amount,
        currency,
        amountBase,
        rateSnapshot,
        baseCurrencySnapshot: state.baseCurrency,
        localCurrencySnapshot: state.localCurrency,
        payer,
        splitAmong,
        date: editingOriginalDate || new Date().toISOString()
    };

    if (editingExpenseId) {
        const index = state.expenses.findIndex(existingExpense => existingExpense.id === editingExpenseId);
        if (index !== -1) state.expenses[index] = expense;
    } else {
        state.expenses.push(expense);
    }

    saveState();
    cancelEditMode();
    renderBalances();
    renderHistory();
    showToast(isEditing ? "Expense updated." : "Expense saved.");
}

function setupEditExpense(id) {
    const expense = state.expenses.find(entry => entry.id === id);
    if (!expense) return;

    editingExpenseId = expense.id;
    editingOriginalDate = expense.date;

    document.querySelector('[data-target="view-add-expense"]').click();

    elements.expCategory.value = expense.category || "Shopping & Misc";
    elements.expDesc.value = expense.desc;

    const savedAsLocal = expense.currency === expense.localCurrencySnapshot;
    const currentBaseAmount = getExpenseAmountInSelectedBase(expense);

    elements.expAmount.value = savedAsLocal
        ? formatNumber(expense.amount, 2)
        : formatNumber(
            expense.baseCurrencySnapshot === state.baseCurrency ? expense.amount : currentBaseAmount,
            2
        );
    elements.expCurrency.value = savedAsLocal ? "LOCAL" : "BASE";

    renderAddExpenseForm();
    elements.expCurrency.value = savedAsLocal ? "LOCAL" : "BASE";
    elements.expPayer.value = expense.payer;

    document.querySelectorAll('.split-check').forEach(checkbox => {
        checkbox.checked = expense.splitAmong.includes(checkbox.value);
    });

    elements.btnSaveExpense.textContent = "Update Expense";
    elements.btnCancelEdit.style.display = "block";
}

function cancelEditMode() {
    editingExpenseId = null;
    editingOriginalDate = null;
    elements.expCategory.value = "Food & Dining";
    elements.expDesc.value = '';
    elements.expAmount.value = '';
    elements.expCurrency.value = "LOCAL";
    elements.btnSaveExpense.textContent = "Save Expense";
    elements.btnCancelEdit.style.display = "none";
    renderAddExpenseForm();
}

function deleteExpense(id) {
    const expense = state.expenses.find(entry => entry.id === id);
    if (!expense) return;

    if (!confirm(`Delete "${expense.desc || expense.category}"?`)) {
        return;
    }

    state.expenses = state.expenses.filter(entry => entry.id !== id);
    if (editingExpenseId === id) {
        cancelEditMode();
    }
    saveAndRender();
    showToast("Expense deleted.");
}

function calculateBalances() {
    const balances = {};
    state.friends.forEach(friend => {
        balances[friend] = 0;
    });

    state.expenses.forEach(expense => {
        const amountInCurrentBase = getExpenseAmountInSelectedBase(expense);

        if (balances[expense.payer] === undefined) balances[expense.payer] = 0;
        balances[expense.payer] += amountInCurrentBase;

        const splitAmount = amountInCurrentBase / Math.max(expense.splitAmong.length, 1);
        expense.splitAmong.forEach(person => {
            if (balances[person] === undefined) balances[person] = 0;
            balances[person] -= splitAmount;
        });
    });

    return balances;
}

function calculateSettlements(balances) {
    const debtors = [];
    const creditors = [];

    Object.entries(balances).forEach(([person, amount]) => {
        if (amount < -0.01) debtors.push({ person, amount: Math.abs(amount) });
        if (amount > 0.01) creditors.push({ person, amount });
    });

    debtors.sort((left, right) => right.amount - left.amount);
    creditors.sort((left, right) => right.amount - left.amount);

    const settlements = [];
    let debtorIndex = 0;
    let creditorIndex = 0;

    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
        const debtor = debtors[debtorIndex];
        const creditor = creditors[creditorIndex];
        const transferAmount = Math.min(debtor.amount, creditor.amount);

        settlements.push({
            from: debtor.person,
            to: creditor.person,
            amount: transferAmount
        });

        debtor.amount -= transferAmount;
        creditor.amount -= transferAmount;

        if (debtor.amount < 0.01) debtorIndex += 1;
        if (creditor.amount < 0.01) creditorIndex += 1;
    }

    return settlements;
}

function renderAll() {
    elements.canvasHeader.style.display = 'none';

    elements.settingBaseCurr.value = state.baseCurrency;
    elements.settingLocalCurr.value = state.localCurrency;

    const currentBase = numberOrFallback(elements.baseAmount.value, 1);
    elements.settingRate.value = (currentBase * state.exchangeRate).toFixed(4).replace(/\.?0+$/, "");

    renderFriends();
    if (!editingExpenseId) renderAddExpenseForm();
    renderBalances();
    renderHistory();
}

function renderFriends() {
    elements.friendsList.innerHTML = '';

    state.friends.forEach(friend => {
        const item = document.createElement('li');
        item.className = 'pill';
        item.innerHTML = `
            <span>${escapeHtml(friend)}</span>
            <button type="button" data-remove-friend="${escapeHtml(friend)}" aria-label="Remove ${escapeHtml(friend)}">&times;</button>
        `;
        elements.friendsList.appendChild(item);
    });
}

function saveAndRender() {
    saveState();
    renderAll();
}

function renderAddExpenseForm() {
    const localOption = elements.expCurrency.querySelector('option[value="LOCAL"]');
    const baseOption = elements.expCurrency.querySelector('option[value="BASE"]');

    if (localOption) {
        localOption.textContent = state.localCurrency
            ? `${state.localCurrency} (Local Currency)`
            : "Local Currency";
    }

    if (baseOption) {
        baseOption.textContent = `${state.baseCurrency} (Base Currency)`;
    }

    const selectedPayer = elements.expPayer.value;
    elements.expPayer.innerHTML = '';
    elements.splitCheckboxes.innerHTML = '';

    state.friends.forEach(friend => {
        const option = document.createElement('option');
        option.value = friend;
        option.textContent = friend;
        elements.expPayer.appendChild(option);

        const label = document.createElement('label');
        label.className = 'checkbox-item';
        label.innerHTML = `<input type="checkbox" class="split-check" value="${escapeHtml(friend)}" checked> <span>${escapeHtml(friend)}</span>`;
        elements.splitCheckboxes.appendChild(label);
    });

    if (selectedPayer && state.friends.includes(selectedPayer)) {
        elements.expPayer.value = selectedPayer;
    } else if (state.friends.length) {
        elements.expPayer.value = state.friends[0];
    }
}

function renderBalances() {
    const balances = calculateBalances();
    const settlements = calculateSettlements(balances);
    const subtitle = document.getElementById('settle-subtitle');

    if (subtitle) {
        subtitle.innerHTML = `Balances shown in <strong>${escapeHtml(state.baseCurrency)}</strong>. Each expense keeps the rate saved with it.`;
    }

    elements.balancesList.innerHTML = '';
    Object.entries(balances).forEach(([person, amount]) => {
        if (Math.abs(amount) <= 0.01) return;

        const item = document.createElement('li');
        const isOwed = amount > 0;
        const absoluteAmount = Math.abs(amount);
        const localEquivalent = state.localCurrency
            ? `<div style="font-size:0.75rem; color:var(--text-secondary); font-weight:400;">~ ${parseFloat((absoluteAmount * state.exchangeRate).toFixed(0)).toLocaleString()} ${escapeHtml(state.localCurrency)}</div>`
            : "";

        item.innerHTML = `
            <span>${escapeHtml(person)}</span>
            <span class="${isOwed ? 'gets' : 'owes'}" style="text-align:right;">
                <div>${isOwed ? '+' : ''}${absoluteAmount.toFixed(2)} ${escapeHtml(state.baseCurrency)}</div>
                ${localEquivalent}
            </span>
        `;
        elements.balancesList.appendChild(item);
    });

    if (!elements.balancesList.innerHTML) {
        elements.balancesList.innerHTML = '<li><span style="color:var(--text-secondary)">Everyone is evenly balanced.</span></li>';
    }

    elements.settlementsList.innerHTML = '';
    settlements.forEach(settlement => {
        const item = document.createElement('li');
        const localEquivalent = state.localCurrency
            ? `<div style="font-size:0.75rem; color:var(--text-secondary); font-weight:400;">or ${parseFloat((settlement.amount * state.exchangeRate).toFixed(0)).toLocaleString()} ${escapeHtml(state.localCurrency)}</div>`
            : "";

        item.innerHTML = `
            <span><strong>${escapeHtml(settlement.from)}</strong> <svg style="width:16px;height:16px;vertical-align:middle;margin:0 4px;color:var(--text-secondary)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg> <strong>${escapeHtml(settlement.to)}</strong></span>
            <span class="owes" style="text-align:right;">
                <div>${settlement.amount.toFixed(2)} ${escapeHtml(state.baseCurrency)}</div>
                ${localEquivalent}
            </span>
        `;
        elements.settlementsList.appendChild(item);
    });

    if (!elements.settlementsList.innerHTML) {
        elements.settlementsList.innerHTML = '<li><span style="color:var(--text-secondary)">No payments needed.</span></li>';
    }
}

function renderHistory() {
    elements.historyList.innerHTML = '';

    [...state.expenses].reverse().forEach(expense => {
        const item = document.createElement('li');
        const dateString = new Date(expense.date).toLocaleDateString();
        const categoryLabel = expense.category ? `[${expense.category}] ` : '';
        const snapshotLabel = `Saved rate: 1 ${expense.baseCurrencySnapshot} = ${expense.rateSnapshot} ${expense.localCurrencySnapshot}`;

        item.innerHTML = `
            <div class="history-item-left" style="flex:1">
                <div class="title"><span style="color:var(--accent); font-size:0.85rem; margin-right:4px;">${escapeHtml(categoryLabel)}</span>${escapeHtml(expense.desc || "Untitled expense")}</div>
                <div class="meta">${escapeHtml(expense.payer)} paid • ${dateString}<br><span style="font-size:0.75rem; color:var(--text-secondary);">${escapeHtml(snapshotLabel)}</span></div>
            </div>
            <div class="history-item-right">
                <div style="font-size: 0.95rem;">${expense.amount.toFixed(2)} ${escapeHtml(expense.currency)}</div>
                <div style="font-size:0.75rem; color:var(--text-secondary);">Now ≈ ${escapeHtml(getCurrentBaseAmountLabel(expense))}</div>
            </div>
            <div class="history-actions">
                <button class="btn secondary-btn action-btn" type="button" data-action="edit" data-expense-id="${expense.id}">Edit</button>
                <button class="btn danger-btn action-btn" type="button" data-action="delete" data-expense-id="${expense.id}">Delete</button>
            </div>
        `;
        elements.historyList.appendChild(item);
    });

    if (!elements.historyList.innerHTML) {
        elements.historyList.innerHTML = '<li style="color:var(--text-secondary);">No expenses logged yet.</li>';
    }
}

init();
