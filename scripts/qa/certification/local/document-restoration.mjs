import {isDeepStrictEqual} from 'node:util';

// Firestore maps are unordered. Updates may move a key even after an exact
// restore, so JSON insertion order is not a persistence postcondition.
export const beforeImageMatches=(current,before)=>isDeepStrictEqual(current,before);
