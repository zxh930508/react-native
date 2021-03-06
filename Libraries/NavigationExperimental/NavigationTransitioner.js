/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule NavigationTransitioner
 * @flow
 */
'use strict';

const Animated = require('Animated');
const Easing = require('Easing');
const NavigationPropTypes = require('NavigationPropTypes');
const NavigationScenesReducer = require('NavigationScenesReducer');
const React = require('React');
const StyleSheet = require('StyleSheet');
const View = require('View');

const invariant = require('fbjs/lib/invariant');

import type {
  NavigationAnimatedValue,
  NavigationLayout,
  NavigationScene,
  NavigationState,
  NavigationTransitionConfigurator,
  NavigationTransitionProps,
} from 'NavigationTypeDefinition';

type Props = {
  configureTransition: NavigationTransitionConfigurator,
  navigationState: NavigationState,
  onTransitionEnd: () => void,
  onTransitionStart: () => void,
  render: (a: NavigationTransitionProps, b: ?NavigationTransitionProps) => any,
  style: any,
};

type State = {
  layout: NavigationLayout,
  position: NavigationAnimatedValue,
  progress: NavigationAnimatedValue,
  scenes: Array<NavigationScene>,
};

const {PropTypes} = React;

const DefaultTransitionSpec = {
  duration: 250,
  easing: Easing.inOut(Easing.ease),
};

function isSceneNotStale(scene: NavigationScene): boolean {
  return !scene.isStale;
}

class NavigationTransitioner extends React.Component<any, Props, State> {
  _onLayout: (event: any) => void;
  _onTransitionEnd: () => void;
  _prevTransitionProps: ?NavigationTransitionProps;
  _transitionProps: NavigationTransitionProps;

  props: Props;
  state: State;

  static propTypes = {
    configureTransition: PropTypes.func,
    navigationState: NavigationPropTypes.navigationState.isRequired,
    onTransitionEnd: PropTypes.func,
    onTransitionStart: PropTypes.func,
    render: PropTypes.func.isRequired,
  };

  constructor(props: Props, context: any) {
    super(props, context);

    // The initial layout isn't measured. Measured layout will be only available
    // when the component is mounted.
    const layout = {
      height: new Animated.Value(0),
      initHeight: 0,
      initWidth: 0,
      isMeasured: false,
      width: new Animated.Value(0),
    };

    this.state = {
      layout,
      position: new Animated.Value(this.props.navigationState.index),
      progress: new Animated.Value(1),
      scenes: NavigationScenesReducer([], this.props.navigationState),
    };

    this._prevTransitionProps = null;
    this._transitionProps = buildTransitionProps(props, this.state);
  }

  componentWillMount(): void {
    this._onLayout = this._onLayout.bind(this);
    this._onTransitionEnd = this._onTransitionEnd.bind(this);
  }

  componentWillReceiveProps(nextProps: Props): void {
    const nextScenes = NavigationScenesReducer(
      this.state.scenes,
      nextProps.navigationState,
      this.props.navigationState
    );

    if (nextScenes === this.state.scenes) {
      return;
    }

    const nextState = {
      ...this.state,
      scenes: nextScenes,
    };

    this._prevTransitionProps = this._transitionProps;
    this._transitionProps = buildTransitionProps(nextProps, nextState);

    const {
      position,
      progress,
    } = nextState;

    // update scenes.
    this.setState(nextState);

    // get the transition spec.
    const transitionUserSpec = nextProps.configureTransition ?
      nextProps.configureTransition() :
      null;

    const transitionSpec = {
      ...DefaultTransitionSpec,
      ...transitionUserSpec,
    };

    progress.setValue(0);

    const animations = [
      Animated.timing(
        progress,
        {
          ...transitionSpec,
          toValue: 1,
        },
      ),
    ];

    if (nextProps.navigationState.index !== this.props.navigationState.index) {
      animations.push(
        Animated.timing(
          position,
          {
            ...transitionSpec,
            toValue: nextProps.navigationState.index,
          },
        ),
      );
    }

    // play the transition.
    nextProps.onTransitionStart && nextProps.onTransitionStart(
      this._transitionProps,
      this._prevTransitionProps,
    );
    Animated.parallel(animations).start(this._onTransitionEnd);
  }

  render(): ReactElement<any> {
    return (
      <View
        onLayout={this._onLayout}
        style={[styles.main, this.props.style]}>
        {this.props.render(this._transitionProps, this._prevTransitionProps)}
      </View>
    );
  }

  _onLayout(event: any): void {
    const {height, width} = event.nativeEvent.layout;

    const layout = {
      ...this.state.layout,
      initHeight: height,
      initWidth: width,
      isMeasured: true,
    };

    layout.height.setValue(height);
    layout.width.setValue(width);

    const nextState = {
      ...this.state,
      layout,
    };

    this._transitionProps = buildTransitionProps(this.props, nextState);
    this.setState(nextState);
  }

  _onTransitionEnd(): void {
    const prevTransitionProps = this._prevTransitionProps;
    this._prevTransitionProps = null;

    const nextState = {
      ...this.state,
      scenes: this.state.scenes.filter(isSceneNotStale),
    };

    this._transitionProps = buildTransitionProps(this.props, nextState);
    this.setState(nextState);

    this.props.onTransitionEnd && this.props.onTransitionEnd(
      this._transitionProps,
      prevTransitionProps,
    );
  }
}

function buildTransitionProps(
  props: Props,
  state: State,
): NavigationTransitionProps {
  const {
    navigationState,
  } = props;

  const {
    layout,
    position,
    progress,
    scenes,
  } = state;

  return {
    layout,
    navigationState,
    position,
    progress,
    scenes,
    scene: findActiveScene(scenes, navigationState.index),
  };
}

function findActiveScene(
  scenes: Array<NavigationScene>,
  index: number,
): NavigationScene {
  for (let ii = 0, jj = scenes.length; ii < jj; ii++) {
    const scene = scenes[ii];
    if (!scene.isStale && scene.index === index) {
      return scene;
    }
  }
  invariant(false, 'scenes must have an active scene');
}

const styles = StyleSheet.create({
  main: {
    flex: 1,
  },
});

module.exports = NavigationTransitioner;
