// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// https://mozilla.org/MPL/2.0/.

/**
 * Side-effect entry: `import 'domlamps/define'` registers `<dom-lamps>`.
 * Does nothing during SSR.
 */
import { defineDomLamps } from './element';

defineDomLamps();

export { DomLampsElement, defineDomLamps } from './element';
