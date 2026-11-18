// save.js — saves the game to localStorage: money, mission progress, the
// player's spot, health, packages and the time of day.
window.SB = window.SB || {};
(function () {
  'use strict';

  SB.save = {
    hasSave: function () {
      try {
        return !!window.localStorage.getItem(SB.config.SAVE_KEY);
      } catch (e) {
        return false;
      }
    },

    saveGame: function () {
      try {
        const pos = SB.player.pos();
        const data = {
          version: 1,
          money: Math.round(SB.player.money),
          health: Math.round(SB.player.health),
          armor: Math.round(SB.player.armor),
          weapon: SB.player.weapon,
          x: +pos.x.toFixed(1),
          z: +pos.z.toFixed(1),
          missionIndex: SB.missions.index,
          storyDone: SB.missions.storyDone,
          packagesFound: SB.missions.packagesFound,
          takenPackages: SB.missions.takenPackages(),
          faresDone: SB.missions.faresDone,
          timeMinutes: Math.round(SB.G.timeMinutes),
          savedAt: Date.now()
        };
        window.localStorage.setItem(SB.config.SAVE_KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        return false;
      }
    },

    loadGame: function () {
      try {
        const raw = window.localStorage.getItem(SB.config.SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || data.version !== 1) return null;
        return data;
      } catch (e) {
        return null;
      }
    },

    applySave: function (data) {
      SB.player.money = data.money;
      SB.player.health = data.health;
      SB.player.armor = data.armor;
      SB.player.weapon = data.weapon;
      if (data.weapon === 'pistol') SB.player.ammo = SB.player.magSize;
      const fixed = SB.city.collideCircle(data.x, data.z, 0.6);
      SB.player.parts.group.position.set(fixed.x, 0, fixed.z);
      SB.missions.setProgress(data.missionIndex, data.storyDone);
      SB.missions.setPackagesFound(data.packagesFound || 0, data.takenPackages || []);
      SB.G.timeMinutes = data.timeMinutes || SB.config.START_TIME_MINUTES;
    },

    clearSave: function () {
      try {
        window.localStorage.removeItem(SB.config.SAVE_KEY);
      } catch (e) {}
    }
  };
})();
