/* ========================================
   NetballStats - Stage 1
   Navigation, Team Management, Match Setup
   ======================================== */

const App = {
    // ---- State ----
    currentView: 'view-home',
    teams: [],          // Saved teams [{name, players: [{name, number}]}]
    matches: [],        // Saved matches
    trackingLevel: 'basic',

    // Current match setup state
    setupPlayers: [],
    setupTeamName: '',

    // ---- Constants ----
    POSITIONS: ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'],
    STORAGE_KEYS: {
        teams: 'netballstats_teams',
        matches: 'netballstats_matches'
    },

    // ==========================================
    // INIT
    // ==========================================
    init() {
        this.loadData();
        this.showView('view-home');
        document.getElementById('setup-date').value = new Date().toISOString().split('T')[0];
        // Pre-populate 10 empty player rows on setup
        this.populatePlayerRows('setup-team-players', 10);
    },

    // ==========================================
    // DATA PERSISTENCE
    // ==========================================
    loadData() {
        try {
            const teamsJson = localStorage.getItem(this.STORAGE_KEYS.teams);
            if (teamsJson) this.teams = JSON.parse(teamsJson);
            const matchesJson = localStorage.getItem(this.STORAGE_KEYS.matches);
            if (matchesJson) this.matches = JSON.parse(matchesJson);
        } catch (e) {
            console.error('Failed to load data:', e);
        }
    },

    saveTeams() {
        localStorage.setItem(this.STORAGE_KEYS.teams, JSON.stringify(this.teams));
    },

    saveMatches() {
        localStorage.setItem(this.STORAGE_KEYS.matches, JSON.stringify(this.matches));
    },

    // ==========================================
    // VIEW NAVIGATION
    // ==========================================
    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(viewId);
        if (view) {
            view.classList.add('active');
            this.currentView = viewId;
            this.onViewEnter(viewId);
        }
    },

    onViewEnter(viewId) {
        switch (viewId) {
            case 'view-manage-teams':
                this.populatePlayerRows('manage-team-players', 10);
                this.renderSavedTeams();
                break;
            case 'view-setup-team':
                this.populateSavedTeamDropdown();
                if (!document.getElementById('setup-team-players').children.length) {
                    this.populatePlayerRows('setup-team-players', 10);
                }
                break;
            case 'view-history':
                this.renderHistory();
                break;
        }
    },

    // ==========================================
    // PLAYER ROW MANAGEMENT
    // ==========================================
    populatePlayerRows(containerId, count) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            this.appendPlayerRow(container, '', '');
        }
    },

    appendPlayerRow(container, name, number) {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.innerHTML = `
            <input type="text" class="player-num" placeholder="#" value="${number}" maxlength="3">
            <input type="text" class="player-name-input" placeholder="Player name" value="${name}">
            <button class="btn-remove" onclick="App.removePlayerRow(this)">&times;</button>
        `;
        container.appendChild(row);
    },

    addPlayerRow(containerId) {
        const container = document.getElementById(containerId);
        this.appendPlayerRow(container, '', '');
        // Focus the new name input
        const inputs = container.querySelectorAll('.player-name-input');
        inputs[inputs.length - 1].focus();
    },

    removePlayerRow(btn) {
        btn.closest('.player-row').remove();
    },

    getPlayersFromContainer(containerId) {
        const container = document.getElementById(containerId);
        const players = [];
        container.querySelectorAll('.player-row').forEach(row => {
            const name = row.querySelector('.player-name-input').value.trim();
            const number = row.querySelector('.player-num').value.trim();
            if (name) {
                players.push({ name, number });
            }
        });
        return players;
    },

    // ==========================================
    // MANAGE TEAMS
    // ==========================================
    saveTeam() {
        const nameInput = document.getElementById('manage-team-name');
        const name = nameInput.value.trim();
        if (!name) {
            this.toast('Please enter a team name', 'error');
            return;
        }
        const players = this.getPlayersFromContainer('manage-team-players');
        if (players.length < 7) {
            this.toast('Add at least 7 players', 'error');
            return;
        }

        // Check if team exists (update) or new
        const existing = this.teams.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
        if (existing >= 0) {
            this.teams[existing].players = players;
        } else {
            this.teams.push({ name, players });
        }
        this.saveTeams();
        this.renderSavedTeams();
        nameInput.value = '';
        this.populatePlayerRows('manage-team-players', 10);
        this.toast(`Team "${name}" saved!`, 'success');
    },

    renderSavedTeams() {
        const container = document.getElementById('saved-teams-list');
        if (!this.teams.length) {
            container.innerHTML = '<p class="empty-state">No saved teams yet</p>';
            return;
        }
        container.innerHTML = this.teams.map((team, i) => `
            <div class="saved-team-card">
                <div>
                    <div class="stc-name">${team.name}</div>
                    <div class="stc-count">${team.players.length} players</div>
                </div>
                <div class="stc-actions">
                    <button class="btn btn-small btn-outline" onclick="App.editTeam(${i})">Edit</button>
                    <button class="btn btn-small btn-danger" onclick="App.deleteTeam(${i})">Delete</button>
                </div>
            </div>
        `).join('');
    },

    editTeam(index) {
        const team = this.teams[index];
        document.getElementById('manage-team-name').value = team.name;
        const container = document.getElementById('manage-team-players');
        container.innerHTML = '';
        team.players.forEach(p => this.appendPlayerRow(container, p.name, p.number));
        // Add a few empty rows
        for (let i = 0; i < 3; i++) this.appendPlayerRow(container, '', '');
        window.scrollTo(0, 0);
    },

    deleteTeam(index) {
        this.showConfirm(`Delete team "${this.teams[index].name}"?`, confirmed => {
            if (confirmed) {
                this.teams.splice(index, 1);
                this.saveTeams();
                this.renderSavedTeams();
                this.toast('Team deleted', 'success');
            }
        });
    },

    // ==========================================
    // MATCH SETUP
    // ==========================================
    populateSavedTeamDropdown() {
        const select = document.getElementById('setup-saved-team');
        select.innerHTML = '<option value="">-- Or enter manually below --</option>';
        this.teams.forEach((team, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${team.name} (${team.players.length} players)`;
            select.appendChild(opt);
        });
    },

    loadSavedTeam() {
        const select = document.getElementById('setup-saved-team');
        const index = parseInt(select.value);
        if (isNaN(index)) return;

        const team = this.teams[index];
        document.getElementById('setup-team-name').value = team.name;

        const container = document.getElementById('setup-team-players');
        container.innerHTML = '';
        team.players.forEach(p => this.appendPlayerRow(container, p.name, p.number));
        for (let i = 0; i < 3; i++) this.appendPlayerRow(container, '', '');
    },

    setTrackingLevel(level) {
        this.trackingLevel = level;
        document.querySelectorAll('.toggle-btn[data-level]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.level === level);
        });
        const hint = document.getElementById('tracking-hint');
        if (level === 'basic') {
            hint.textContent = 'Goals, centre passes, interceptions, turnovers';
        } else {
            hint.textContent = 'All stats: goals, feeds, assists, deflections, rebounds, penalties, pickups';
        }
    },

    proceedToLineup() {
        const teamName = document.getElementById('setup-team-name').value.trim();
        const opposition = document.getElementById('setup-opposition').value.trim();
        const players = this.getPlayersFromContainer('setup-team-players');

        if (!teamName) { this.toast('Enter your team name', 'error'); return; }
        if (!opposition) { this.toast('Enter opposition name', 'error'); return; }
        if (players.length < 7) { this.toast('Need at least 7 players', 'error'); return; }

        // Store setup data for match creation
        this.setupTeamName = teamName;
        this.setupPlayers = players.map((p, i) => ({ ...p, id: i }));
        this.setupOpposition = opposition;
        this.setupDate = document.getElementById('setup-date').value;
        this.setupVenue = document.getElementById('setup-venue').value.trim();
        this.setupCompetition = document.getElementById('setup-competition').value.trim();
        this.setupQuarterLength = parseInt(document.getElementById('setup-quarter-length').value);

        // Reset lineup
        this.lineup = {};
        this.POSITIONS.forEach(pos => {
            document.getElementById('lineup-' + pos).textContent = 'Tap to assign';
            document.querySelector(`.position-slot[data-pos="${pos}"]`).classList.remove('assigned');
        });

        this.showView('view-lineup');
    },

    // ==========================================
    // LINEUP SELECTION
    // ==========================================
    lineup: {},
    selectedPosition: null,

    selectPosition(pos) {
        this.selectedPosition = pos;
        const picker = document.getElementById('player-picker');
        const title = document.getElementById('picker-title');
        const grid = document.getElementById('picker-players');

        title.textContent = `Select player for ${pos}`;

        // Show available players (not already assigned to another position)
        const assignedIds = new Set(Object.values(this.lineup).map(p => p.id));

        grid.innerHTML = this.setupPlayers.map(player => {
            const taken = assignedIds.has(player.id) && !(this.lineup[pos] && this.lineup[pos].id === player.id);
            const numLabel = player.number ? `#${player.number} ` : '';
            return `<button class="picker-player ${taken ? 'taken' : ''}"
                onclick="${taken ? '' : `App.assignPlayer(${player.id})`}"
                ${taken ? 'disabled' : ''}>
                ${numLabel}${player.name}
            </button>`;
        }).join('');

        picker.classList.remove('hidden');
    },

    assignPlayer(playerId) {
        const player = this.setupPlayers.find(p => p.id === playerId);
        if (!player || !this.selectedPosition) return;

        // Remove player from any other position
        Object.keys(this.lineup).forEach(pos => {
            if (this.lineup[pos] && this.lineup[pos].id === playerId && pos !== this.selectedPosition) {
                delete this.lineup[pos];
                document.getElementById('lineup-' + pos).textContent = 'Tap to assign';
                document.querySelector(`.position-slot[data-pos="${pos}"]`).classList.remove('assigned');
            }
        });

        this.lineup[this.selectedPosition] = player;
        const numLabel = player.number ? `#${player.number} ` : '';
        document.getElementById('lineup-' + this.selectedPosition).textContent = numLabel + player.name;
        document.querySelector(`.position-slot[data-pos="${this.selectedPosition}"]`).classList.add('assigned');

        this.closePlayerPicker();
    },

    closePlayerPicker() {
        document.getElementById('player-picker').classList.add('hidden');
        this.selectedPosition = null;
    },

    // ==========================================
    // START MATCH (placeholder - Stage 2)
    // ==========================================
    startMatch() {
        // Check all 7 positions filled
        const filled = this.POSITIONS.filter(pos => this.lineup[pos]);
        if (filled.length < 7) {
            this.toast(`Assign all 7 positions (${filled.length}/7 done)`, 'error');
            return;
        }
        this.toast('Match engine coming in Stage 2!', 'success');
        // Stage 2 will initialize the match and show view-match
    },

    // ==========================================
    // MATCH HISTORY (placeholder - Stage 3)
    // ==========================================
    renderHistory() {
        const container = document.getElementById('history-list');
        const empty = document.getElementById('history-empty');

        if (!this.matches.length) {
            container.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        container.innerHTML = this.matches.map((m, i) => `
            <div class="history-card" onclick="App.viewMatchSummary(${i})">
                <div class="hc-date">${m.date || 'Unknown date'}${m.venue ? ' - ' + m.venue : ''}</div>
                <div class="hc-score">${m.homeScore} - ${m.awayScore}</div>
                <div class="hc-teams">${m.homeTeam} vs ${m.awayTeam}</div>
                ${m.competition ? `<div class="hc-comp">${m.competition}</div>` : ''}
            </div>
        `).join('');
    },

    viewMatchSummary(index) {
        this.toast('Match summary coming in Stage 3!', 'success');
    },

    // ==========================================
    // UI HELPERS
    // ==========================================
    toast(message, type = 'success') {
        const el = document.getElementById('toast');
        el.textContent = message;
        el.className = `toast toast-${type}`;
        el.classList.remove('hidden');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.classList.add('hidden'), 2500);
    },

    _confirmCallback: null,
    showConfirm(message, callback) {
        document.getElementById('confirm-message').textContent = message;
        document.getElementById('confirm-dialog').classList.remove('hidden');
        this._confirmCallback = callback;
    },

    confirmDialog(result) {
        document.getElementById('confirm-dialog').classList.add('hidden');
        if (this._confirmCallback) {
            this._confirmCallback(result);
            this._confirmCallback = null;
        }
    }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
