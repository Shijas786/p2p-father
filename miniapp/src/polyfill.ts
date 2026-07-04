import React from 'react';

// Polyfill React.use for React 18 compatibility with libraries expecting React 19 (e.g. @tanstack/react-router)
if (typeof (React as any).use !== 'function') {
  (React as any).use = function <T>(usable: any): T {
    // Handle React Context
    if (usable && usable.$$typeof === Symbol.for('react.context')) {
      return React.useContext(usable);
    }
    
    // Handle Promise (Thenable)
    if (usable && typeof usable.then === 'function') {
      const thenable = usable as any;
      if (thenable.status === 'fulfilled') {
        return thenable.value;
      } else if (thenable.status === 'rejected') {
        throw thenable.reason;
      } else if (thenable.status === 'pending') {
        throw thenable;
      } else {
        thenable.status = 'pending';
        thenable.then(
          (value: any) => {
            thenable.status = 'fulfilled';
            thenable.value = value;
          },
          (reason: any) => {
            thenable.status = 'rejected';
            thenable.reason = reason;
          }
        );
        throw thenable;
      }
    }
    
    throw new Error('Unsupported usable passed to React.use');
  };
}
