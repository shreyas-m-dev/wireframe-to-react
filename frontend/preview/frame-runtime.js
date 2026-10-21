/*
 * Runs inside preview-frame.html: an <iframe sandbox="allow-scripts"> with an
 * opaque origin and its own CSP (no network, no forms, no navigation of the
 * parent). It receives server-compiled JS for the generated component via
 * postMessage, evaluates it here — never in the app's origin — and reports
 * back with { source: 'w2r-preview', nonce, type }.
 *
 * Classic script (no modules): sandboxed opaque-origin documents cannot load
 * module scripts without CORS, and everything is inlined anyway.
 */
(function () {
  'use strict';

  var IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  var HOOKS = ['useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'useReducer', 'useLayoutEffect', 'useId', 'Fragment'];
  var currentNonce = null;
  var root = ReactDOM.createRoot(document.getElementById('root'));

  function post(message) {
    message.source = 'w2r-preview';
    message.nonce = currentNonce;
    // The parent's origin is not visible from an opaque origin; the parent
    // verifies event.source instead. Messages carry no secrets.
    window.parent.postMessage(message, '*');
  }

  function Icon(props) {
    return React.createElement('span', {
      'aria-hidden': 'true',
      title: props && props.name,
      className: 'inline-block h-4 w-4 rounded bg-current opacity-30 ' + ((props && props.className) || ''),
    });
  }

  class Boundary extends React.Component {
    constructor(props) { super(props); this.state = { failed: false }; }
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error) { post({ type: 'error', phase: 'render', message: String((error && error.message) || error).slice(0, 300) }); }
    componentDidMount() { post({ type: 'rendered' }); }
    render() { return this.state.failed ? null : this.props.children; }
  }

  function render(data) {
    currentNonce = typeof data.nonce === 'string' ? data.nonce : null;
    if (typeof data.js !== 'string' || !IDENTIFIER.test(String(data.componentName))) {
      post({ type: 'error', phase: 'compile', message: 'Preview payload is malformed.' });
      return;
    }
    var Component;
    try {
      var factory = new Function(['React', 'Icon'].concat(HOOKS).join(','), data.js + '\n;return ' + data.componentName + ';'); // eslint-disable-line no-new-func
      Component = factory.apply(null, [React, Icon].concat(HOOKS.map(function (name) { return React[name]; })));
      if (typeof Component !== 'function') throw new Error('Generated module did not produce a component.');
    } catch (error) {
      post({ type: 'error', phase: 'compile', message: String((error && error.message) || error).slice(0, 300) });
      return;
    }
    root.render(React.createElement(Boundary, { key: currentNonce }, React.createElement(Component)));
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (data && data.type === 'render') render(data);
  });
  window.addEventListener('error', function (event) {
    post({ type: 'error', phase: 'runtime', message: String(event.message || 'Script error').slice(0, 300) });
  });
  window.addEventListener('unhandledrejection', function (event) {
    post({ type: 'error', phase: 'runtime', message: String((event.reason && event.reason.message) || event.reason).slice(0, 300) });
  });
  // Liveness signal: if generated code blocks this thread, heartbeats stop
  // and the parent tears the frame down.
  setInterval(function () { post({ type: 'heartbeat' }); }, 1000);
  post({ type: 'ready' });
})();
