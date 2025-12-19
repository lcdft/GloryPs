// accounts.js - manage saved accounts UI and form integration
(function(){
    const STORAGE_KEY = 'gt_saved_accounts_v1';

    function getSaved(){
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e){ return []; }
    }
    function saveList(list){ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }

    function renderList(container){
        const list = getSaved();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div class="text-sm text-gray-300 text-center py-4">No saved accounts</div>';
            return;
        }
        list.forEach((a, idx) => {
            const el = document.createElement('div');
            el.className = 'account-item p-2 bg-white/5 rounded flex justify-between items-center cursor-pointer';
            el.innerHTML = `<div class="truncate text-white">${escapeHtml(a.growId || '')}</div>
                <div class="flex gap-2">
                    <button data-idx="${idx}" class="use-account bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs transition-all">Use</button>
                    <button data-idx="${idx}" class="del-account bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs transition-all">Delete</button>
                </div>`;
            container.appendChild(el);
        });
    }

    function escapeHtml(s){ return String(s).replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>'); }

    function openChooser(){
        const chooser = document.getElementById('accounts-chooser');
        if(!chooser) return;
        chooser.classList.remove('hidden');
        const listEl = document.getElementById('accounts-list');
        renderList(listEl);
        listEl.querySelectorAll('.use-account').forEach(btn=> btn.addEventListener('click', onUse));
        listEl.querySelectorAll('.del-account').forEach(btn=> btn.addEventListener('click', onDel));
    }

    function openDashboard(){
        const listEl = document.getElementById('accounts-list');
        if(!listEl) return;
        renderList(listEl);
        listEl.querySelectorAll('.use-account').forEach(btn=> btn.addEventListener('click', onUse));
        listEl.querySelectorAll('.del-account').forEach(btn=> btn.addEventListener('click', onDel));

        // Set up clear all button
        const clearAllBtn = document.getElementById('clear-all');
        if(clearAllBtn) {
            clearAllBtn.addEventListener('click', clearAll);
        }
    }

    function onUse(e){
        const idx = Number(e.currentTarget.dataset.idx);
        const acc = getSaved()[idx];
        if(!acc) return;

        // For dashboard, we need to redirect to login with the account info
        // Store the account info temporarily
        localStorage.setItem('temp_login_growid', acc.growId || '');
        localStorage.setItem('temp_login_password', acc.password || '');

        // Redirect to login page
        window.location.href = '/player/login/dashboard';
    }

    function onDel(e){
        const idx = Number(e.currentTarget.dataset.idx);
        const list = getSaved();
        list.splice(idx,1);
        saveList(list);
        renderList(document.getElementById('accounts-list'));
    }

    function clearAll(){
        if(confirm('Are you sure you want to clear all saved accounts?')) {
            saveList([]);
            renderList(document.getElementById('accounts-list'));
        }
    }

    function attachFormSaver(form){
        if(!form) return;
        form.addEventListener('submit', async function(ev){
            // allow normal submit to server but intercept to save on success via fetch
            ev.preventDefault();
            const data = new FormData(form);
            const payload = {};
            data.forEach((v,k)=> payload[k]=v);
            try{
                const res = await fetch(form.action, { method: form.method || 'POST', headers: { 'Accept': 'text/html' }, body: new URLSearchParams(payload) });
                const txt = await res.text();
                let json = {};
                try{ json = JSON.parse(txt); }catch(e){ json = { status: 'success' }; }
                if(json.status === 'success'){
                    if((document.getElementById('remember') && document.getElementById('remember').checked) || (document.getElementById('reg-remember') && document.getElementById('reg-remember').checked)){
                        const list = getSaved();
                        const entry = { growId: payload.growId||'', password: payload.password||'', email: payload.email||'', savedAt: Date.now() };
                        // avoid duplicates
                        const exists = list.find(i=> i.growId === entry.growId);
                        if(!exists) list.unshift(entry);
                        else { list.splice(list.indexOf(exists),1); list.unshift(entry); }
                        saveList(list.slice(0,10));
                    }
                    // if returned token/url, you might redirect later - for now just reload
                    window.location.reload();
                } else {
                    alert('Error: ' + (json.message || 'Unknown'));
                }
            } catch(err){ console.error(err); alert('Network error'); }
        });
    }

    // init
    document.addEventListener('DOMContentLoaded', ()=>{
        const chooser = document.getElementById('accounts-chooser');
        const listEl = document.getElementById('accounts-list');
        const dashboardListEl = document.getElementById('accounts-list');

        if(chooser && listEl){
            // open chooser on load per requirement
            openChooser();
            document.getElementById('close-chooser').addEventListener('click', ()=> chooser.classList.add('hidden'));
            document.getElementById('use-manual').addEventListener('click', ()=> chooser.classList.add('hidden'));
            document.getElementById('clear-all').addEventListener('click', clearAll);
        }

        // Check if we're on the dashboard page
        if(window.location.pathname.includes('dashboard') && dashboardListEl) {
            openDashboard();
        }

        attachFormSaver(document.getElementById('auth-form'));
        attachFormSaver(document.getElementById('register-form'));
    });
})();
