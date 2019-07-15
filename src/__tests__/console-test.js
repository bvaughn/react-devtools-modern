// @flow

describe('console', () => {
  let React;
  let ReactDOM;
  let act;
  let enableConsole;
  let disableConsole;
  let fakeConsole;
  let mockError;
  let mockLog;
  let mockWarn;
  let patchConsole;

  beforeEach(() => {
    let inject = global.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject;
    let injectedInternals = null;
    global.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject = internals => {
      injectedInternals = internals;
      inject(internals);
    };

    React = require('react');
    ReactDOM = require('react-dom');

    const utils = require('./utils');
    act = utils.act;

    const Console = require('../backend/console');
    enableConsole = Console.enable;
    disableConsole = Console.disable;
    patchConsole = Console.patch;

    // Patch a fake console so we can verify with tests below.
    // Patching the real console is too complicated,
    // because Jest itself has hooks into it as does our test env setup.
    mockError = jest.fn();
    mockLog = jest.fn();
    mockWarn = jest.fn();
    fakeConsole = {
      error: mockError,
      log: mockLog,
      warn: mockWarn,
    };
    patchConsole(fakeConsole, (injectedInternals: any));
  });

  function normalizeCodeLocInfo(str) {
    return str && str.replace(/\(at .+?:\d+\)/g, '(at **)');
  }

  it('should pass through logs when there is no current fiber', () => {
    expect(mockLog).toHaveBeenCalledTimes(0);
    expect(mockWarn).toHaveBeenCalledTimes(0);
    expect(mockError).toHaveBeenCalledTimes(0);
    fakeConsole.log('log');
    fakeConsole.warn('warn');
    fakeConsole.error('error');
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0]).toHaveLength(1);
    expect(mockLog.mock.calls[0][0]).toBe('log');
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0]).toHaveLength(1);
    expect(mockWarn.mock.calls[0][0]).toBe('warn');
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError.mock.calls[0]).toHaveLength(1);
    expect(mockError.mock.calls[0][0]).toBe('error');
  });

  it('should suppress console logging when disabled', () => {
    disableConsole();
    fakeConsole.log('log');
    fakeConsole.warn('warn');
    fakeConsole.error('error');
    expect(mockLog).toHaveBeenCalledTimes(0);
    expect(mockWarn).toHaveBeenCalledTimes(0);
    expect(mockError).toHaveBeenCalledTimes(0);

    enableConsole();
    fakeConsole.log('log');
    fakeConsole.warn('warn');
    fakeConsole.error('error');
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0]).toHaveLength(1);
    expect(mockLog.mock.calls[0][0]).toBe('log');
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0]).toHaveLength(1);
    expect(mockWarn.mock.calls[0][0]).toBe('warn');
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError.mock.calls[0]).toHaveLength(1);
    expect(mockError.mock.calls[0][0]).toBe('error');
  });

  it('should not append multiple stacks', () => {
    const Child = () => {
      fakeConsole.warn('warn', '\n    in Child (at fake.js:123)');
      return null;
    };

    act(() => ReactDOM.render(<Child />, document.createElement('div')));

    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0]).toHaveLength(2);
    expect(mockWarn.mock.calls[0][0]).toBe('warn');
    expect(mockWarn.mock.calls[0][1]).toBe('\n    in Child (at fake.js:123)');
  });

  it('should append component stacks to errors and warnings logged during render', () => {
    const Intermediate = ({ children }) => children;
    const Parent = () => (
      <Intermediate>
        <Child />
      </Intermediate>
    );
    const Child = () => {
      fakeConsole.error('error');
      fakeConsole.log('log');
      fakeConsole.warn('warn');
      return null;
    };

    act(() => ReactDOM.render(<Parent />, document.createElement('div')));

    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0]).toHaveLength(1);
    expect(mockLog.mock.calls[0][0]).toBe('log');
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0]).toHaveLength(2);
    expect(mockWarn.mock.calls[0][0]).toBe('warn');
    expect(normalizeCodeLocInfo(mockWarn.mock.calls[0][1])).toEqual(
      '\n    in Child (at **)\n    in Parent (at **)'
    );
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError.mock.calls[0]).toHaveLength(2);
    expect(mockError.mock.calls[0][0]).toBe('error');
    expect(normalizeCodeLocInfo(mockError.mock.calls[0][1])).toBe(
      '\n    in Child (at **)\n    in Parent (at **)'
    );
  });

  it('should append component stacks to errors and warnings logged from effects', () => {
    const Intermediate = ({ children }) => children;
    const Parent = () => (
      <Intermediate>
        <Child />
      </Intermediate>
    );
    const Child = () => {
      React.useLayoutEffect(() => {
        fakeConsole.error('active error');
        fakeConsole.log('active log');
        fakeConsole.warn('active warn');
      });
      React.useEffect(() => {
        fakeConsole.error('passive error');
        fakeConsole.log('passive log');
        fakeConsole.warn('passive warn');
      });
      return null;
    };

    act(() => ReactDOM.render(<Parent />, document.createElement('div')));

    expect(mockLog).toHaveBeenCalledTimes(2);
    expect(mockLog.mock.calls[0]).toHaveLength(1);
    expect(mockLog.mock.calls[0][0]).toBe('active log');
    expect(mockLog.mock.calls[1]).toHaveLength(1);
    expect(mockLog.mock.calls[1][0]).toBe('passive log');
    expect(mockWarn).toHaveBeenCalledTimes(2);
    expect(mockWarn.mock.calls[0]).toHaveLength(2);
    expect(mockWarn.mock.calls[0][0]).toBe('active warn');
    expect(normalizeCodeLocInfo(mockWarn.mock.calls[0][1])).toEqual(
      '\n    in Child (at **)\n    in Parent (at **)'
    );
    expect(mockWarn.mock.calls[1]).toHaveLength(2);
    expect(mockWarn.mock.calls[1][0]).toBe('passive warn');
    expect(normalizeCodeLocInfo(mockWarn.mock.calls[1][1])).toEqual(
      '\n    in Child (at **)\n    in Parent (at **)'
    );
    expect(mockError).toHaveBeenCalledTimes(2);
    expect(mockError.mock.calls[0]).toHaveLength(2);
    expect(mockError.mock.calls[0][0]).toBe('active error');
    expect(normalizeCodeLocInfo(mockError.mock.calls[0][1])).toBe(
      '\n    in Child (at **)\n    in Parent (at **)'
    );
    expect(mockError.mock.calls[1]).toHaveLength(2);
    expect(mockError.mock.calls[1][0]).toBe('passive error');
    expect(normalizeCodeLocInfo(mockError.mock.calls[1][1])).toBe(
      '\n    in Child (at **)\n    in Parent (at **)'
    );
  });

  it('should append component stacks to errors and warnings logged from commit hooks', () => {
    const Intermediate = ({ children }) => children;
    const Parent = () => (
      <Intermediate>
        <Child />
      </Intermediate>
    );
    class Child extends React.Component<any> {
      componentDidMount() {
        fakeConsole.error('didMount error');
        fakeConsole.log('didMount log');
        fakeConsole.warn('didMount warn');
      }
      componentDidUpdate() {
        fakeConsole.error('didUpdate error');
        fakeConsole.log('didUpdate log');
        fakeConsole.warn('didUpdate warn');
      }
      render() {
        return null;
      }
    }

    const container = document.createElement('div');
    act(() => ReactDOM.render(<Parent />, container));
    act(() => ReactDOM.render(<Parent />, container));

    expect(mockLog).toHaveBeenCalledTimes(2);
    expect(mockLog.mock.calls[0]).toHaveLength(1);
    expect(mockLog.mock.calls[0][0]).toBe('didMount log');
    expect(mockLog.mock.calls[1]).toHaveLength(1);
    expect(mockLog.mock.calls[1][0]).toBe('didUpdate log');
    expect(mockWarn).toHaveBeenCalledTimes(2);
    expect(mockWarn.mock.calls[0]).toHaveLength(2);
    expect(mockWarn.mock.calls[0][0]).toBe('didMount warn');
    expect(normalizeCodeLocInfo(mockWarn.mock.calls[0][1])).toEqual(
      '\n    in Child (at **)\n    in Parent (at **)'
    );
    expect(mockWarn.mock.calls[1]).toHaveLength(2);
    expect(mockWarn.mock.calls[1][0]).toBe('didUpdate warn');
    expect(normalizeCodeLocInfo(mockWarn.mock.calls[1][1])).toEqual(
      '\n    in Child (at **)\n    in Parent (at **)'
    );
    expect(mockError).toHaveBeenCalledTimes(2);
    expect(mockError.mock.calls[0]).toHaveLength(2);
    expect(mockError.mock.calls[0][0]).toBe('didMount error');
    expect(normalizeCodeLocInfo(mockError.mock.calls[0][1])).toBe(
      '\n    in Child (at **)\n    in Parent (at **)'
    );
    expect(mockError.mock.calls[1]).toHaveLength(2);
    expect(mockError.mock.calls[1][0]).toBe('didUpdate error');
    expect(normalizeCodeLocInfo(mockError.mock.calls[1][1])).toBe(
      '\n    in Child (at **)\n    in Parent (at **)'
    );
  });

  it('should append component stacks to errors and warnings logged from gDSFP', () => {
    const Intermediate = ({ children }) => children;
    const Parent = () => (
      <Intermediate>
        <Child />
      </Intermediate>
    );
    class Child extends React.Component<any, any> {
      state = {};
      static getDerivedStateFromProps() {
        fakeConsole.error('error');
        fakeConsole.log('log');
        fakeConsole.warn('warn');
        return null;
      }
      render() {
        return null;
      }
    }

    act(() => ReactDOM.render(<Parent />, document.createElement('div')));

    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0]).toHaveLength(1);
    expect(mockLog.mock.calls[0][0]).toBe('log');
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0]).toHaveLength(2);
    expect(mockWarn.mock.calls[0][0]).toBe('warn');
    expect(normalizeCodeLocInfo(mockWarn.mock.calls[0][1])).toEqual(
      '\n    in Child (at **)\n    in Parent (at **)'
    );
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError.mock.calls[0]).toHaveLength(2);
    expect(mockError.mock.calls[0][0]).toBe('error');
    expect(normalizeCodeLocInfo(mockError.mock.calls[0][1])).toBe(
      '\n    in Child (at **)\n    in Parent (at **)'
    );
  });
});
