// ===== QuincenaApp - Main Application Logic =====

// ===== Data Layer =====
const DB_KEY = 'quincenal_app_data';

function loadData() {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return { users: [], currentUserId: null };
    return JSON.parse(raw);
}

function saveData(data) {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ===== State =====
let appData = loadData();
let currentUser = null;
let activeQuincena = null;
let editingDebtId = null;
let payingDebtId = null;

// ===== DOM References =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Screens
const userScreen = $('#user-screen');
const appScreen = $('#app-screen');

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    renderUserList();
    setupEventListeners();
});

// ===== Event Listeners Setup =====
function setupEventListeners() {
    // User management
    $('#btn-add-user').addEventListener('click', () => openModal('modal-add-user'));
    $('#btn-save-user').addEventListener('click', saveUser);
    $('#btn-cancel-user').addEventListener('click', () => closeModal('modal-add-user'));
    $('#modal-close-user').addEventListener('click', () => closeModal('modal-add-user'));
    $('#input-username').addEventListener('keypress', (e) => { if (e.key === 'Enter') saveUser(); });

    // Navigation
    $('#btn-back-users').addEventListener('click', goBackToUsers);
    $('#btn-history').addEventListener('click', () => { renderHistory(); openModal('modal-history'); });
    $('#btn-export').addEventListener('click', () => openModal('modal-export'));

    // Quincena
    $('#btn-new-quincena').addEventListener('click', () => {
        // Auto-fill today's date
        const today = new Date().toISOString().split('T')[0];
        $('#input-quincena-date').value = today;
        openModal('modal-quincena');
    });
    $('#btn-save-quincena').addEventListener('click', saveQuincena);
    $('#btn-close-quincena').addEventListener('click', closeQuincena);

    // Debts
    $('#btn-add-debt').addEventListener('click', () => { editingDebtId = null; openDebtModal(); });
    $('#btn-save-debt').addEventListener('click', saveDebt);

    // Pay
    document.querySelectorAll('input[name="pay-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            $('#partial-amount-group').style.display = e.target.value === 'partial' ? 'block' : 'none';
        });
    });
    $('#input-receipt').addEventListener('change', handleReceiptUpload);
    $('#btn-confirm-pay').addEventListener('click', confirmPay);

    // Expenses
    $('#btn-add-expense').addEventListener('click', () => openModal('modal-expense'));
    $('#btn-save-expense').addEventListener('click', saveExpense);

    // Export
    document.querySelectorAll('input[name="export-range"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            $('#custom-range-group').style.display = e.target.value === 'custom' ? 'block' : 'none';
        });
    });
    $('#btn-do-export').addEventListener('click', doExport);

    // Tabs
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Close modals with generic close buttons
    $$('.modal-close-generic').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            modal.classList.remove('active');
        });
    });

    // Close modals on backdrop click
    $$('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

// ===== User Management =====
function renderUserList() {
    const list = $('#user-list');
    if (appData.users.length === 0) {
        list.innerHTML = '<p style="color: var(--gray-500); font-size: 14px; padding: 20px;">No hay usuarios. ¡Crea uno para empezar!</p>';
        return;
    }
    list.innerHTML = appData.users.map(user => {
        const initial = user.name.charAt(0).toUpperCase();
        const quincenaCount = (user.quincenas || []).length;
        return `
            <div class="user-card" data-user-id="${user.id}">
                <div class="user-avatar">${initial}</div>
                <div class="user-card-info">
                    <div class="user-card-name">${escapeHtml(user.name)}</div>
                    <div class="user-card-meta">${quincenaCount} quincena${quincenaCount !== 1 ? 's' : ''} registrada${quincenaCount !== 1 ? 's' : ''}</div>
                </div>
                <button class="user-card-delete" onclick="event.stopPropagation(); deleteUser('${user.id}')" title="Eliminar">🗑</button>
            </div>
        `;
    }).join('');

    // Add click listeners
    list.querySelectorAll('.user-card').forEach(card => {
        card.addEventListener('click', () => selectUser(card.dataset.userId));
    });
}

function saveUser() {
    const name = $('#input-username').value.trim();
    if (!name) { toast('Ingresa un nombre'); return; }

    const user = {
        id: generateId(),
        name,
        createdAt: new Date().toISOString(),
        quincenas: [],
        debts: []
    };

    appData.users.push(user);
    saveData(appData);
    renderUserList();
    closeModal('modal-add-user');
    $('#input-username').value = '';
    toast(`Usuario "${name}" creado ✨`);
}

function deleteUser(userId) {
    if (!confirm('¿Eliminar este usuario y todos sus datos?')) return;
    appData.users = appData.users.filter(u => u.id !== userId);
    saveData(appData);
    renderUserList();
    toast('Usuario eliminado');
}

function selectUser(userId) {
    currentUser = appData.users.find(u => u.id === userId);
    if (!currentUser) return;
    appData.currentUserId = userId;
    saveData(appData);
    showAppScreen();
}

// ===== Screen Navigation =====
function showAppScreen() {
    userScreen.classList.remove('active');
    appScreen.classList.add('active');
    $('#header-username').textContent = currentUser.name;

    // Find active quincena (latest non-closed)
    activeQuincena = currentUser.quincenas.find(q => !q.closed);
    
    if (activeQuincena) {
        $('#setup-quincena').style.display = 'none';
        $('#main-content').style.display = 'block';
        $('#btn-close-quincena').style.display = 'block';
        renderDebts();
        renderExpenses();
        updateBalance();
    } else {
        $('#setup-quincena').style.display = 'block';
        $('#main-content').style.display = 'none';
        $('#btn-close-quincena').style.display = 'none';
        updateBalanceEmpty();
    }
}

function goBackToUsers() {
    appScreen.classList.remove('active');
    userScreen.classList.add('active');
    currentUser = null;
    activeQuincena = null;
}

// ===== Quincena Management =====
function saveQuincena() {
    const dateVal = $('#input-quincena-date').value;
    const income = parseFloat($('#input-quincena-income').value) || 0;

    if (!dateVal) { toast('Selecciona una fecha'); return; }
    if (income <= 0) { toast('Ingresa un monto válido'); return; }

    const quincena = {
        id: generateId(),
        date: dateVal,
        income: income,
        debts: [],
        expenses: [],
        payments: [],
        closed: false,
        createdAt: new Date().toISOString()
    };

    // Copy existing debts with their current balances
    currentUser.debts.forEach(debt => {
        if (debt.remainingBalance > 0) {
            quincena.debts.push({
                debtId: debt.id,
                name: debt.name,
                totalDebt: debt.remainingBalance,
                amountThisQuincena: debt.amountPerQuincena,
                paid: false,
                paidAmount: 0,
                receipt: null
            });
        }
    });

    currentUser.quincenas.push(quincena);
    saveData(appData);
    activeQuincena = quincena;

    // Reset form
    $('#input-quincena-date').value = '';
    $('#input-quincena-income').value = '';
    closeModal('modal-quincena');

    showAppScreen();
    toast('¡Quincena iniciada! 🚀');
}

function closeQuincena() {
    if (!activeQuincena) return;
    if (!confirm('¿Cerrar esta quincena? Se moverá al historial.')) return;

    activeQuincena.closed = true;
    activeQuincena.closedAt = new Date().toISOString();

    // Update debt remaining balances based on payments
    activeQuincena.debts.forEach(qDebt => {
        if (qDebt.paid) {
            const masterDebt = currentUser.debts.find(d => d.id === qDebt.debtId);
            if (masterDebt) {
                masterDebt.remainingBalance = Math.max(0, masterDebt.remainingBalance - qDebt.paidAmount);
            }
        }
    });

    saveData(appData);
    activeQuincena = null;
    showAppScreen();
    toast('Quincena cerrada ✅');
}

function updateBalance() {
    if (!activeQuincena) return;

    const income = activeQuincena.income;
    
    // Calculate total spent (paid debts + expenses)
    let totalDebtsPaid = 0;
    activeQuincena.debts.forEach(d => {
        if (d.paid) totalDebtsPaid += d.paidAmount;
    });
    
    let totalExpenses = 0;
    activeQuincena.expenses.forEach(e => {
        totalExpenses += e.amount;
    });

    const totalSpent = totalDebtsPaid + totalExpenses;
    const remaining = income - totalSpent;

    $('#balance-income').textContent = formatMoney(income);
    $('#balance-spent').textContent = formatMoney(totalSpent);
    $('#balance-remaining').textContent = formatMoney(remaining);
    $('#balance-remaining').className = 'balance-amount' + (remaining < 0 ? ' text-danger' : '');

    // Update bar
    const percent = Math.min(100, Math.max(0, (totalSpent / income) * 100));
    $('#balance-bar-fill').style.width = percent + '%';

    // Visual feedback for negative balance
    const balanceCard = document.querySelector('.balance-card');
    if (remaining < 0) {
        balanceCard.classList.add('negative');
    } else {
        balanceCard.classList.remove('negative');
    }

    // Update quincena label
    const date = new Date(activeQuincena.date + 'T12:00:00');
    const day = date.getDate();
    const label = day <= 15 ? '1ra Quincena' : '2da Quincena';
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    $('#quincena-label').textContent = `${label} - ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function updateBalanceEmpty() {
    $('#balance-income').textContent = '₡0';
    $('#balance-spent').textContent = '₡0';
    $('#balance-remaining').textContent = '₡0';
    $('#balance-bar-fill').style.width = '0%';
    $('#quincena-label').textContent = '--';
}

// ===== Debt Management =====
function openDebtModal(debtId) {
    if (debtId) {
        editingDebtId = debtId;
        const debt = currentUser.debts.find(d => d.id === debtId);
        if (debt) {
            $('#modal-debt-title').textContent = 'Editar Deuda';
            $('#input-debt-name').value = debt.name;
            $('#input-debt-total').value = debt.totalAmount;
            $('#input-debt-quincena').value = debt.amountPerQuincena;
        }
    } else {
        editingDebtId = null;
        $('#modal-debt-title').textContent = 'Agregar Deuda';
        $('#input-debt-name').value = '';
        $('#input-debt-total').value = '';
        $('#input-debt-quincena').value = '';
    }
    openModal('modal-debt');
}

function saveDebt() {
    const name = $('#input-debt-name').value.trim();
    const total = parseFloat($('#input-debt-total').value) || 0;
    const quincenaAmount = parseFloat($('#input-debt-quincena').value) || 0;

    if (!name) { toast('Ingresa el nombre de la deuda'); return; }
    if (total <= 0) { toast('Ingresa el monto total'); return; }
    if (quincenaAmount <= 0) { toast('Ingresa el monto por quincena'); return; }

    if (editingDebtId) {
        // Edit existing
        const debt = currentUser.debts.find(d => d.id === editingDebtId);
        if (debt) {
            debt.name = name;
            debt.totalAmount = total;
            debt.amountPerQuincena = quincenaAmount;
            // Update in active quincena too
            if (activeQuincena) {
                const qDebt = activeQuincena.debts.find(d => d.debtId === editingDebtId);
                if (qDebt) {
                    qDebt.name = name;
                    qDebt.amountThisQuincena = quincenaAmount;
                }
            }
        }
    } else {
        // New debt
        const debt = {
            id: generateId(),
            name,
            totalAmount: total,
            remainingBalance: total,
            amountPerQuincena: quincenaAmount,
            createdAt: new Date().toISOString()
        };
        currentUser.debts.push(debt);

        // Also add to active quincena
        if (activeQuincena) {
            activeQuincena.debts.push({
                debtId: debt.id,
                name: debt.name,
                totalDebt: debt.remainingBalance,
                amountThisQuincena: quincenaAmount,
                paid: false,
                paidAmount: 0,
                receipt: null
            });
        }
    }

    saveData(appData);
    renderDebts();
    updateBalance();
    closeModal('modal-debt');
    toast(editingDebtId ? 'Deuda actualizada' : 'Deuda agregada ✅');
}

function deleteDebt(debtId) {
    if (!confirm('¿Eliminar esta deuda?')) return;
    currentUser.debts = currentUser.debts.filter(d => d.id !== debtId);
    if (activeQuincena) {
        activeQuincena.debts = activeQuincena.debts.filter(d => d.debtId !== debtId);
    }
    saveData(appData);
    renderDebts();
    updateBalance();
    toast('Deuda eliminada');
}

function renderDebts() {
    const list = $('#debt-list');
    const empty = $('#empty-debts');

    if (!activeQuincena || activeQuincena.debts.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    list.innerHTML = activeQuincena.debts.map(qDebt => {
        const masterDebt = currentUser.debts.find(d => d.id === qDebt.debtId);
        const remainingBalance = masterDebt ? masterDebt.remainingBalance : qDebt.totalDebt;
        const statusClass = qDebt.paid ? 'paid' : 'pending';
        const statusText = qDebt.paid 
            ? (qDebt.paidAmount >= qDebt.amountThisQuincena ? 'Pagado ✓' : `Parcial: ${formatMoney(qDebt.paidAmount)}`)
            : 'Pendiente';

        return `
            <div class="debt-card ${qDebt.paid ? 'paid' : ''}">
                <div class="debt-card-header">
                    <span class="debt-card-name">${escapeHtml(qDebt.name)}</span>
                    <div class="debt-card-actions">
                        <button onclick="openDebtModal('${qDebt.debtId}')" title="Editar">✏️</button>
                        <button onclick="deleteDebt('${qDebt.debtId}')" title="Eliminar">🗑</button>
                    </div>
                </div>
                <div class="debt-card-amounts">
                    <div class="debt-amount-item">
                        <span class="debt-amount-label">Total Deuda</span>
                        <span class="debt-amount-value">${formatMoney(remainingBalance)}</span>
                    </div>
                    <div class="debt-amount-item">
                        <span class="debt-amount-label">Esta Quincena</span>
                        <span class="debt-amount-value">${formatMoney(qDebt.amountThisQuincena)}</span>
                    </div>
                    <div class="debt-amount-item">
                        <span class="debt-amount-label">Pagado</span>
                        <span class="debt-amount-value ${qDebt.paid ? 'text-success' : ''}">${formatMoney(qDebt.paidAmount)}</span>
                    </div>
                </div>
                <div class="debt-card-footer">
                    <span class="debt-status ${qDebt.paid ? (qDebt.paidAmount >= qDebt.amountThisQuincena ? 'paid' : 'partial') : 'pending'}">${statusText}</span>
                    <div>
                        ${qDebt.receipt ? `<button class="btn-receipt" onclick="viewReceipt('${qDebt.debtId}')">📎 Ver comprobante</button>` : ''}
                        ${!qDebt.paid ? `<button class="btn-pay" onclick="openPayModal('${qDebt.debtId}')">💳 Pagar</button>` : 
                         `<button class="btn-pay" style="background:var(--gray-400)" onclick="undoPay('${qDebt.debtId}')">↩ Deshacer</button>`}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ===== Payment =====
function openPayModal(debtId) {
    payingDebtId = debtId;
    const qDebt = activeQuincena.debts.find(d => d.debtId === debtId);
    if (!qDebt) return;

    $('#pay-info').innerHTML = `
        <div class="pay-info-name">${escapeHtml(qDebt.name)}</div>
        <div class="pay-info-detail">Monto a pagar esta quincena: <strong>${formatMoney(qDebt.amountThisQuincena)}</strong></div>
    `;

    // Reset form
    document.querySelector('input[name="pay-type"][value="full"]').checked = true;
    $('#partial-amount-group').style.display = 'none';
    $('#input-partial-amount').value = '';
    $('#receipt-preview').style.display = 'none';
    $('#file-upload-label').innerHTML = '<span>📎</span> Adjuntar imagen del comprobante';
    $('#input-receipt').value = '';

    openModal('modal-pay');
}

function handleReceiptUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        toast('La imagen es muy pesada (máx. 5MB)');
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        $('#receipt-preview').src = event.target.result;
        $('#receipt-preview').style.display = 'block';
        $('#file-upload-label').innerHTML = `<span>✅</span> ${file.name}`;
    };
    reader.readAsDataURL(file);
}

function confirmPay() {
    if (!payingDebtId || !activeQuincena) return;
    
    const qDebt = activeQuincena.debts.find(d => d.debtId === payingDebtId);
    if (!qDebt) return;

    const payType = document.querySelector('input[name="pay-type"]:checked').value;
    let paidAmount;

    if (payType === 'full') {
        paidAmount = qDebt.amountThisQuincena;
    } else {
        paidAmount = parseFloat($('#input-partial-amount').value) || 0;
        if (paidAmount <= 0) { toast('Ingresa un monto válido'); return; }
    }

    qDebt.paid = true;
    qDebt.paidAmount = paidAmount;
    qDebt.paidAt = new Date().toISOString();

    // Save receipt if uploaded
    const receiptImg = $('#receipt-preview');
    if (receiptImg.style.display !== 'none' && receiptImg.src) {
        qDebt.receipt = receiptImg.src;
    }

    // Add to payments log
    activeQuincena.payments.push({
        debtId: payingDebtId,
        debtName: qDebt.name,
        amount: paidAmount,
        type: payType,
        date: new Date().toISOString(),
        receipt: qDebt.receipt
    });

    // Update master debt remaining balance in real time
    const masterDebt = currentUser.debts.find(d => d.id === payingDebtId);
    if (masterDebt) {
        masterDebt.remainingBalance = Math.max(0, masterDebt.remainingBalance - paidAmount);
    }

    saveData(appData);
    renderDebts();
    updateBalance();
    closeModal('modal-pay');
    toast(`Pago de ${formatMoney(paidAmount)} registrado ✅`);
}

function viewReceipt(debtId) {
    const qDebt = activeQuincena.debts.find(d => d.debtId === debtId);
    if (!qDebt || !qDebt.receipt) return;
    $('#receipt-view-img').src = qDebt.receipt;
    openModal('modal-receipt');
}

function undoPay(debtId) {
    if (!confirm('¿Deshacer este pago?')) return;
    const qDebt = activeQuincena.debts.find(d => d.debtId === debtId);
    if (!qDebt) return;

    // Restore master debt balance
    const masterDebt = currentUser.debts.find(d => d.id === debtId);
    if (masterDebt) {
        masterDebt.remainingBalance += qDebt.paidAmount;
    }

    // Remove from payments log
    activeQuincena.payments = activeQuincena.payments.filter(p => 
        !(p.debtId === debtId && p.amount === qDebt.paidAmount)
    );

    // Reset debt payment status
    qDebt.paid = false;
    qDebt.paidAmount = 0;
    qDebt.receipt = null;
    qDebt.paidAt = null;

    saveData(appData);
    renderDebts();
    updateBalance();
    toast('Pago deshecho ↩');
}

// ===== Expenses =====
function saveExpense() {
    const name = $('#input-expense-name').value.trim();
    const amount = parseFloat($('#input-expense-amount').value) || 0;

    if (!name) { toast('Ingresa una descripción'); return; }
    if (amount <= 0) { toast('Ingresa un monto válido'); return; }

    activeQuincena.expenses.push({
        id: generateId(),
        name,
        amount,
        date: new Date().toISOString()
    });

    saveData(appData);
    renderExpenses();
    updateBalance();
    closeModal('modal-expense');
    $('#input-expense-name').value = '';
    $('#input-expense-amount').value = '';
    toast('Gasto agregado');
}

function deleteExpense(expenseId) {
    if (!activeQuincena) return;
    activeQuincena.expenses = activeQuincena.expenses.filter(e => e.id !== expenseId);
    saveData(appData);
    renderExpenses();
    updateBalance();
    toast('Gasto eliminado');
}

function renderExpenses() {
    const list = $('#expense-list');
    const empty = $('#empty-expenses');

    if (!activeQuincena || activeQuincena.expenses.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    list.innerHTML = activeQuincena.expenses.map(expense => {
        const date = new Date(expense.date);
        const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
        return `
            <div class="expense-card">
                <div class="expense-card-left">
                    <div>
                        <div class="expense-card-name">${escapeHtml(expense.name)}</div>
                        <div class="expense-card-date">${dateStr}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;">
                    <span class="expense-card-amount">-${formatMoney(expense.amount)}</span>
                    <button class="expense-card-delete" onclick="deleteExpense('${expense.id}')" title="Eliminar">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

// ===== Tabs =====
function switchTab(tabName) {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
    $(`#tab-${tabName}`).classList.add('active');
}

// ===== History =====
function renderHistory() {
    const list = $('#history-list');
    const empty = $('#empty-history');
    
    const closedQuincenas = (currentUser.quincenas || []).filter(q => q.closed);
    
    if (closedQuincenas.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    list.innerHTML = closedQuincenas.sort((a, b) => new Date(b.date) - new Date(a.date)).map(q => {
        const date = new Date(q.date + 'T12:00:00');
        const day = date.getDate();
        const label = day <= 15 ? '1ra Quincena' : '2da Quincena';
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const dateLabel = `${label} - ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
        
        const totalSpent = q.debts.reduce((sum, d) => sum + (d.paid ? d.paidAmount : 0), 0) +
                          q.expenses.reduce((sum, e) => sum + e.amount, 0);

        return `
            <div class="history-item" onclick="viewHistoryDetail('${q.id}')">
                <div class="history-item-left">
                    <h4>${dateLabel}</h4>
                    <p>Ingreso: ${formatMoney(q.income)} | Gastado: ${formatMoney(totalSpent)}</p>
                </div>
                <span class="history-item-amount">${formatMoney(q.income - totalSpent)}</span>
            </div>
        `;
    }).join('');
}

function viewHistoryDetail(quincenaId) {
    const q = currentUser.quincenas.find(qu => qu.id === quincenaId);
    if (!q) return;

    const date = new Date(q.date + 'T12:00:00');
    const day = date.getDate();
    const label = day <= 15 ? '1ra Quincena' : '2da Quincena';
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    $('#history-detail-title').textContent = `${label} - ${monthNames[date.getMonth()]} ${date.getFullYear()}`;

    const totalDebtsPaid = q.debts.reduce((sum, d) => sum + (d.paid ? d.paidAmount : 0), 0);
    const totalExpenses = q.expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalSpent = totalDebtsPaid + totalExpenses;

    let html = `
        <div class="detail-section">
            <div class="detail-grid">
                <div class="detail-stat">
                    <span class="detail-stat-label">Ingreso</span>
                    <span class="detail-stat-value text-success">${formatMoney(q.income)}</span>
                </div>
                <div class="detail-stat">
                    <span class="detail-stat-label">Gastado</span>
                    <span class="detail-stat-value text-danger">${formatMoney(totalSpent)}</span>
                </div>
                <div class="detail-stat">
                    <span class="detail-stat-label">Restante</span>
                    <span class="detail-stat-value">${formatMoney(q.income - totalSpent)}</span>
                </div>
            </div>
        </div>
    `;

    if (q.debts.length > 0) {
        html += `<div class="detail-section"><h4>🏦 Deudas</h4>`;
        q.debts.forEach(d => {
            const statusEmoji = d.paid ? '✅' : '⏳';
            html += `
                <div class="detail-list-item">
                    <span class="name">${statusEmoji} ${escapeHtml(d.name)}</span>
                    <span>
                        <span class="amount">${formatMoney(d.paidAmount)}</span>
                        <span class="status">/ ${formatMoney(d.amountThisQuincena)}</span>
                    </span>
                </div>
            `;
        });
        html += `</div>`;
    }

    if (q.expenses.length > 0) {
        html += `<div class="detail-section"><h4>🛒 Gastos Adicionales</h4>`;
        q.expenses.forEach(e => {
            html += `
                <div class="detail-list-item">
                    <span class="name">${escapeHtml(e.name)}</span>
                    <span class="amount text-danger">-${formatMoney(e.amount)}</span>
                </div>
            `;
        });
        html += `</div>`;
    }

    $('#history-detail-body').innerHTML = html;
    closeModal('modal-history');
    openModal('modal-history-detail');
}

// ===== Export =====
function doExport() {
    const range = document.querySelector('input[name="export-range"]:checked').value;
    const format = document.querySelector('input[name="export-format"]:checked').value;

    let quincenasToExport = [];

    if (range === 'current') {
        if (activeQuincena) {
            quincenasToExport = [activeQuincena];
        } else {
            toast('No hay quincena activa para exportar');
            return;
        }
    } else if (range === 'month') {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        quincenasToExport = currentUser.quincenas.filter(q => {
            const d = new Date(q.date + 'T12:00:00');
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });
    } else {
        const from = new Date($('#export-from').value + 'T00:00:00');
        const to = new Date($('#export-to').value + 'T23:59:59');
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            toast('Selecciona las fechas del rango');
            return;
        }
        quincenasToExport = currentUser.quincenas.filter(q => {
            const d = new Date(q.date + 'T12:00:00');
            return d >= from && d <= to;
        });
    }

    if (quincenasToExport.length === 0) {
        toast('No hay datos para exportar en ese rango');
        return;
    }

    if (format === 'csv') {
        exportCSV(quincenasToExport);
    } else {
        exportPDF(quincenasToExport);
    }

    closeModal('modal-export');
}

function exportCSV(quincenas) {
    let csv = 'Quincena,Tipo,Nombre,Monto Programado,Monto Pagado,Estado\n';

    quincenas.forEach(q => {
        const date = new Date(q.date + 'T12:00:00');
        const dateLabel = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

        q.debts.forEach(d => {
            csv += `${dateLabel},Deuda,${d.name},${d.amountThisQuincena},${d.paidAmount},${d.paid ? 'Pagado' : 'Pendiente'}\n`;
        });

        q.expenses.forEach(e => {
            csv += `${dateLabel},Gasto,${e.name},${e.amount},${e.amount},Registrado\n`;
        });
    });

    downloadFile(csv, `quincena_${currentUser.name}_${Date.now()}.csv`, 'text/csv');
    toast('CSV descargado 📥');
}

function exportPDF(quincenas) {
    // Generate a printable HTML that can be saved as PDF
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Reporte - ${currentUser.name}</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
            h1 { color: #7c3aed; border-bottom: 2px solid #7c3aed; padding-bottom: 10px; }
            h2 { color: #5b21b6; margin-top: 30px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
            th { background: #f5f3ff; font-weight: 600; }
            .total-row { font-weight: bold; background: #f9fafb; }
            .paid { color: #10b981; }
            .pending { color: #f59e0b; }
            .summary { display: flex; gap: 20px; margin: 20px 0; }
            .summary-box { flex: 1; padding: 15px; background: #f9fafb; border-radius: 8px; text-align: center; }
            .summary-label { font-size: 12px; color: #6b7280; }
            .summary-value { font-size: 20px; font-weight: bold; margin-top: 5px; }
            .receipt-img { max-width: 200px; max-height: 150px; margin: 5px 0; border-radius: 4px; }
            @media print { body { padding: 20px; } }
        </style>
    </head>
    <body>
        <h1>💰 Reporte de Gastos - ${escapeHtml(currentUser.name)}</h1>
        <p>Generado el: ${new Date().toLocaleDateString('es-CR')}</p>
    `;

    quincenas.forEach(q => {
        const date = new Date(q.date + 'T12:00:00');
        const day = date.getDate();
        const label = day <= 15 ? '1ra Quincena' : '2da Quincena';
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        const totalDebtsPaid = q.debts.reduce((sum, d) => sum + (d.paid ? d.paidAmount : 0), 0);
        const totalExpenses = q.expenses.reduce((sum, e) => sum + e.amount, 0);
        const totalSpent = totalDebtsPaid + totalExpenses;

        html += `
            <h2>${label} - ${monthNames[date.getMonth()]} ${date.getFullYear()}</h2>
            <div class="summary">
                <div class="summary-box">
                    <div class="summary-label">Ingreso</div>
                    <div class="summary-value" style="color:#10b981">${formatMoney(q.income)}</div>
                </div>
                <div class="summary-box">
                    <div class="summary-label">Gastado</div>
                    <div class="summary-value" style="color:#ef4444">${formatMoney(totalSpent)}</div>
                </div>
                <div class="summary-box">
                    <div class="summary-label">Disponible</div>
                    <div class="summary-value">${formatMoney(q.income - totalSpent)}</div>
                </div>
            </div>
        `;

        if (q.debts.length > 0) {
            html += `
                <h3>🏦 Deudas</h3>
                <table>
                    <tr><th>Deuda</th><th>Programado</th><th>Pagado</th><th>Estado</th></tr>
            `;
            q.debts.forEach(d => {
                html += `<tr>
                    <td>${escapeHtml(d.name)}</td>
                    <td>${formatMoney(d.amountThisQuincena)}</td>
                    <td>${formatMoney(d.paidAmount)}</td>
                    <td class="${d.paid ? 'paid' : 'pending'}">${d.paid ? '✅ Pagado' : '⏳ Pendiente'}</td>
                </tr>`;
                if (d.receipt) {
                    html += `<tr><td colspan="4"><img src="${d.receipt}" class="receipt-img" alt="Comprobante"></td></tr>`;
                }
            });
            html += `<tr class="total-row"><td>Total Deudas</td><td></td><td>${formatMoney(totalDebtsPaid)}</td><td></td></tr></table>`;
        }

        if (q.expenses.length > 0) {
            html += `
                <h3>🛒 Gastos Adicionales</h3>
                <table>
                    <tr><th>Descripción</th><th>Monto</th><th>Fecha</th></tr>
            `;
            q.expenses.forEach(e => {
                const eDate = new Date(e.date);
                html += `<tr>
                    <td>${escapeHtml(e.name)}</td>
                    <td>${formatMoney(e.amount)}</td>
                    <td>${eDate.toLocaleDateString('es-CR')}</td>
                </tr>`;
            });
            html += `<tr class="total-row"><td>Total Gastos</td><td>${formatMoney(totalExpenses)}</td><td></td></tr></table>`;
        }
    });

    html += `</body></html>`;

    // Open in new window for printing
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
        win.onload = () => { win.print(); };
    } else {
        // Fallback: download as HTML
        downloadFile(html, `reporte_${currentUser.name}_${Date.now()}.html`, 'text/html');
    }
    toast('Reporte generado 📄');
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ===== Utility Functions =====
function formatMoney(amount) {
    return '₡' + amount.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 3000);
}

// ===== Auto-restore last session =====
(function autoRestore() {
    if (appData.currentUserId) {
        const user = appData.users.find(u => u.id === appData.currentUserId);
        if (user) {
            // Don't auto-login, just show user list
        }
    }
})();
