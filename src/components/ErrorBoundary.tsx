// ---------------------------------------------------------------------------
// App-level error boundary. A render crash anywhere in the tree shows a
// recoverable fallback screen instead of closing the app outright.
// ---------------------------------------------------------------------------

import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          backgroundColor: '#fff',
        }}
      >
        <Ionicons name="warning-outline" size={48} color="#be123c" />
        <Text style={{ marginTop: 12, fontSize: 18, fontWeight: '700', color: '#0f172a' }}>
          Something went wrong
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontSize: 13,
            color: '#64748b',
            textAlign: 'center',
          }}
        >
          {this.state.error.message}
        </Text>
        <Pressable
          onPress={this.reset}
          style={{
            marginTop: 20,
            backgroundColor: '#0ea5e9',
            borderRadius: 12,
            paddingHorizontal: 20,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
