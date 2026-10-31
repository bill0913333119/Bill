import React from 'react';
import { SafeAreaView } from 'react-native';
import EnglishLearningApp from './src/EnglishLearningApp';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <EnglishLearningApp text="Apple Banana" />
    </SafeAreaView>
  );
}
