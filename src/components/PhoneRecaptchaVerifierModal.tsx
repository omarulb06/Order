// ---------------------------------------------------------------------------
// Self-contained Firebase Phone-Auth reCAPTCHA verifier.
//
// Implements the Firebase JS SDK `ApplicationVerifier` contract:
//   { type: 'recaptcha', verify(): Promise<string> }
//
// Why this exists: the deprecated expo-firebase-recaptcha package pulls in
// expo-firebase-core, whose JS touches a native module that does not exist
// in SDK 51 builds — importing it crashes the app the moment the sign-in
// screen mounts. This component replicates the same proven approach
// (a WebView hosting the Firebase v8 web SDK + Google reCAPTCHA, tokens
// relayed via window.ReactNativeWebView.postMessage) with zero native
// dependencies beyond react-native-webview.
//
// Usage:
//   const ref = useRef<PhoneRecaptchaVerifierModal>(null);
//   <PhoneRecaptchaVerifierModal
//     ref={ref}
//     firebaseConfig={firebaseApp.options}
//     attemptInvisibleVerification
//   />
//   await signInWithPhoneNumber(auth, phone, ref.current!);
// ---------------------------------------------------------------------------

import * as React from 'react';
import {
  ActivityIndicator,
  Button,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

export interface FirebaseWebConfig {
  authDomain?: string;
  [key: string]: unknown;
}

interface Props {
  firebaseConfig: FirebaseWebConfig;
  firebaseVersion?: string;
  appVerificationDisabledForTesting?: boolean;
  languageCode?: string;
  attemptInvisibleVerification?: boolean;
  title?: string;
  cancelLabel?: string;
}

interface State {
  visible: boolean;
  visibleLoaded: boolean;
  invisibleLoaded: boolean;
  invisibleVerify: boolean;
  invisibleKey: number;
  resolve?: (token: string) => void;
  reject?: (err: Error) => void;
}

function getWebviewSource(
  firebaseConfig: FirebaseWebConfig,
  firebaseVersion?: string,
  appVerificationDisabledForTesting = false,
  languageCode?: string,
  invisible?: boolean
) {
  const version = firebaseVersion || '8.0.0';
  return {
    baseUrl: `https://${firebaseConfig.authDomain}`,
    html: `
<!DOCTYPE html><html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
  <meta name="HandheldFriendly" content="true">
  <script src="https://www.gstatic.com/firebasejs/${version}/firebase-app.js"></script>
  <script src="https://www.gstatic.com/firebasejs/${version}/firebase-auth.js"></script>
  <script type="text/javascript">firebase.initializeApp(${JSON.stringify(firebaseConfig)});</script>
  <style>
    html, body { height: 100%; ${invisible ? 'padding: 0; margin: 0;' : ''} }
    #recaptcha-btn {
      width: 100%; height: 100%; padding: 0; margin: 0; border: 0;
      user-select: none; -webkit-user-select: none;
    }
  </style>
</head>
<body>
  ${invisible
    ? '<button id="recaptcha-btn" type="button" onclick="onClickButton()">Confirm reCAPTCHA</button>'
    : '<div id="recaptcha-cont" class="g-recaptcha"></div>'}
  <script>
    var fullChallengeTimer;
    function onVerify(token) {
      if (fullChallengeTimer) {
        clearInterval(fullChallengeTimer);
        fullChallengeTimer = undefined;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'verify', token: token }));
    }
    function onLoad() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'load' }));
      firebase.auth().settings.appVerificationDisabledForTesting = ${appVerificationDisabledForTesting};
      ${languageCode ? `firebase.auth().languageCode = '${languageCode}';` : ''}
      window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier("${invisible ? 'recaptcha-btn' : 'recaptcha-cont'}", {
        size: "${invisible ? 'invisible' : 'normal'}",
        callback: onVerify
      });
      window.recaptchaVerifier.render();
    }
    function onError() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error' }));
    }
    function onClickButton() {
      if (!fullChallengeTimer) {
        fullChallengeTimer = setInterval(function() {
          var iframes = document.getElementsByTagName("iframe");
          var isFullChallenge = false;
          for (var i = 0; i < iframes.length; i++) {
            var parentWindow = iframes[i].parentNode ? iframes[i].parentNode.parentNode : undefined;
            var isHidden = parentWindow && parentWindow.style.opacity == 0;
            isFullChallenge = isFullChallenge || (
              !isHidden &&
              ((iframes[i].title === 'recaptcha challenge') ||
               (iframes[i].src.indexOf('google.com/recaptcha/api2/bframe') >= 0)));
          }
          if (isFullChallenge) {
            clearInterval(fullChallengeTimer);
            fullChallengeTimer = undefined;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'fullChallenge' }));
          }
        }, 100);
      }
    }
    window.addEventListener('message', function(event) {
      if (event.data.verify) {
        document.getElementById('recaptcha-btn').click();
      }
    });
  </script>
  <script src="https://www.google.com/recaptcha/api.js?onload=onLoad&render=explicit&hl=${languageCode ?? ''}" onerror="onError()"></script>
</body></html>`,
  };
}

interface RecaptchaProps extends React.ComponentProps<typeof WebView> {
  firebaseConfig: FirebaseWebConfig;
  firebaseVersion?: string;
  appVerificationDisabledForTesting?: boolean;
  languageCode?: string;
  onLoad?: () => void;
  onError?: () => void;
  onVerify: (token: string) => void;
  onFullChallenge?: () => void;
  invisible?: boolean;
  verify?: boolean;
}

function FirebaseRecaptcha(props: RecaptchaProps) {
  const {
    firebaseConfig,
    firebaseVersion,
    appVerificationDisabledForTesting,
    languageCode,
    onLoad,
    onError,
    onVerify,
    onFullChallenge,
    invisible,
    verify,
    ...otherProps
  } = props;

  const webview = React.useRef<WebView>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (webview.current && loaded && verify) {
      webview.current.injectJavaScript(`
        (function(){
          window.dispatchEvent(new MessageEvent('message', {data: { verify: true }}));
        })();
        true;
      `);
    }
  }, [verify, loaded]);

  if (!firebaseConfig?.authDomain) {
    return null;
  }

  return (
    <WebView
      ref={webview}
      javaScriptEnabled
      automaticallyAdjustContentInsets
      scalesPageToFit
      mixedContentMode="always"
      originWhitelist={['*']}
      source={getWebviewSource(
        firebaseConfig,
        firebaseVersion,
        appVerificationDisabledForTesting,
        languageCode,
        invisible
      )}
      onError={onError}
      onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          switch (data.type) {
            case 'load':
              setLoaded(true);
              onLoad?.();
              break;
            case 'error':
              onError?.();
              break;
            case 'verify':
              onVerify(data.token);
              break;
            case 'fullChallenge':
              onFullChallenge?.();
              break;
          }
        } catch {
          // ignore malformed webview messages
        }
      }}
      {...otherProps}
    />
  );
}

export class PhoneRecaptchaVerifierModal extends React.Component<Props, State> {
  static defaultProps = {
    title: 'reCAPTCHA',
    cancelLabel: 'Cancel',
  };

  state: State = {
    visible: false,
    visibleLoaded: false,
    invisibleLoaded: false,
    invisibleVerify: false,
    invisibleKey: 1,
    resolve: undefined,
    reject: undefined,
  };

  static getDerivedStateFromProps(props: Props, state: State) {
    if (!props.attemptInvisibleVerification && state.invisibleLoaded) {
      return { invisibleLoaded: false, invisibleVerify: false };
    }
    return null;
  }

  /** ApplicationVerifier contract — Firebase Auth reads this. */
  get type(): string {
    return 'recaptcha';
  }

  /** ApplicationVerifier contract — resolves with the reCAPTCHA token. */
  async verify(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.props.attemptInvisibleVerification) {
        this.setState({ invisibleVerify: true, resolve, reject });
      } else {
        this.setState({ visible: true, visibleLoaded: false, resolve, reject });
      }
    });
  }

  // Compatibility shim with the firebase-js-sdk verifier lifecycle.
  _reset(): void {}

  private onVisibleLoad = () => this.setState({ visibleLoaded: true });
  private onInvisibleLoad = () => this.setState({ invisibleLoaded: true });

  private onFullChallenge = () => {
    this.setState({ invisibleVerify: false, visible: true });
  };

  private onError = () => {
    this.state.reject?.(new Error('Failed to load reCAPTCHA'));
    this.setState({ visible: false, invisibleVerify: false });
  };

  private onVerify = (token: string) => {
    this.state.resolve?.(token);
    this.setState((state) => ({
      visible: false,
      invisibleVerify: false,
      invisibleLoaded: false,
      invisibleKey: state.invisibleKey + 1,
    }));
  };

  private cancel = () => {
    this.state.reject?.(new Error('reCAPTCHA cancelled by user'));
    this.setState({ visible: false });
  };

  render() {
    const { title, cancelLabel, attemptInvisibleVerification, ...otherProps } = this.props;
    const { visible, visibleLoaded, invisibleLoaded, invisibleVerify, invisibleKey } = this.state;

    return (
      <View style={styles.container}>
        {attemptInvisibleVerification ? (
          <FirebaseRecaptcha
            {...otherProps}
            key={`invisible${invisibleKey}`}
            style={styles.invisible}
            onLoad={this.onInvisibleLoad}
            onError={this.onError}
            onVerify={this.onVerify}
            onFullChallenge={this.onFullChallenge}
            invisible
            verify={invisibleLoaded && invisibleVerify}
          />
        ) : null}
        <Modal
          visible={visible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={this.cancel}
          onDismiss={this.state.visible ? this.cancel : undefined}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <View style={styles.cancel}>
                <Button title={cancelLabel ?? 'Cancel'} onPress={this.cancel} />
              </View>
            </View>
            <View style={styles.content}>
              <FirebaseRecaptcha
                {...otherProps}
                style={styles.content}
                onLoad={this.onVisibleLoad}
                onError={this.onError}
                onVerify={this.onVerify}
              />
              {!visibleLoaded ? (
                <View style={styles.loader}>
                  <ActivityIndicator size="large" />
                </View>
              ) : null}
            </View>
          </SafeAreaView>
        </Modal>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { width: 0, height: 0 },
  invisible: { width: 300, height: 300 },
  modalContainer: { flex: 1 },
  header: {
    backgroundColor: '#FBFBFB',
    height: 44,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomColor: '#CECECE',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancel: { position: 'absolute', left: 8, justifyContent: 'center' },
  title: { fontWeight: 'bold' },
  content: { flex: 1 },
  loader: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 20,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
});

export default PhoneRecaptchaVerifierModal;
