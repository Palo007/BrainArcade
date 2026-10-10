/* SPDX-License-Identifier: AGPL-3.0-or-later */
// A page header can offer a place for Layout's top-right controls (Electrodes, Muse status),
// so they sit in the header row instead of floating over it. Value: a ref setter or null.
import { createContext } from 'react';

export const TopBarSlotContext = createContext(null);
