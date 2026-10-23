/* SPDX-License-Identifier: AGPL-3.0-or-later */
// All on-screen texts, one file per app area and language. Keys are "area.thing".
// Add a text: same key in en/<area>.js and sk/<area>.js. Check: node tools/check-i18n.mjs
import enCore from './en/core.js';
import enReport from './en/report.js';
import enViewer from './en/viewer.js';
import enHippoRex from './en/hippoRex.js';
import enGames from './en/games.js';
import skCore from './sk/core.js';
import skReport from './sk/report.js';
import skViewer from './sk/viewer.js';
import skHippoRex from './sk/hippoRex.js';
import skGames from './sk/games.js';

export const MESSAGES = {
  en: { ...enCore, ...enReport, ...enViewer, ...enHippoRex, ...enGames },
  sk: { ...skCore, ...skReport, ...skViewer, ...skHippoRex, ...skGames },
};
