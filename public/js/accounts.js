const ACCOUNTS_KEY = 'growtopia_saved_accounts';

const Accounts = {
    getAll: () => {
        try {
            const data = localStorage.getItem(ACCOUNTS_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) { return []; }
    },
    save: (growId, password) => {
        let accounts = Accounts.getAll();
        // Remove existing to update it
        accounts = accounts.filter(acc => acc.growId.toLowerCase() !== growId.toLowerCase());
        // Add to top
        accounts.unshift({ growId: growId, password: btoa(password), lastLogin: Date.now() });
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    },
    remove: (growId) => {
        let accounts = Accounts.getAll();
        accounts = accounts.filter(acc => acc.growId.toLowerCase() !== growId.toLowerCase());
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
        location.reload();
    },
    clear: () => {
        localStorage.removeItem(ACCOUNTS_KEY);
        location.reload();
    }
};
window.Accounts = Accounts;
