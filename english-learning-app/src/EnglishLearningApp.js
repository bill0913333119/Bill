import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Button } from 'react-native';
import Tts from 'react-native-tts';
import dictionary from './dictionary';

// 去掉前後標點並轉小寫，讓 "Apple," 或 "apple" 都能查到
const normalize = (word) => word.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '').toLowerCase();

const EnglishLearningApp = ({ text = 'Apple Banana' }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState({ text: '', phonetic: '', translation: '' });

  useEffect(() => {
    Tts.getInitStatus()
      .then(() => Tts.setDefaultLanguage('en-US'))
      .catch(() => {}); // 裝置沒有 TTS 引擎時不讓 App 當掉
  }, []);

  const speak = (word) => {
    Tts.stop();
    Tts.speak(word);
  };

  const handleWordPress = (rawWord) => {
    const word = normalize(rawWord);
    if (!word) return;
    const wordData = dictionary[word];
    setSelectedWord({
      text: word,
      phonetic: wordData ? wordData.phonetic : '',
      translation: wordData ? wordData.translation : '（字典尚未收錄）',
    });
    setModalVisible(true);
    speak(word);
  };

  const renderText = (content) =>
    content
      .split(/\s+/)
      .filter(Boolean)
      .map((word, index) => (
        <TouchableOpacity key={`${word}-${index}`} onPress={() => handleWordPress(word)}>
          <Text style={styles.wordText}>{word}</Text>
        </TouchableOpacity>
      ));

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>{renderText(text)}</View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalWord}>{selectedWord.text}</Text>
            {selectedWord.phonetic ? (
              <Text style={styles.modalPhonetic}>{selectedWord.phonetic}</Text>
            ) : null}
            <Text style={styles.modalTranslation}>{selectedWord.translation}</Text>
            <View style={styles.buttonRow}>
              <Button title="再聽一次" onPress={() => speak(selectedWord.text)} />
              <Button title="關閉" onPress={() => setModalVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  textContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  wordText: { fontSize: 24, marginHorizontal: 4 },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalWord: { fontSize: 32, fontWeight: 'bold' },
  modalPhonetic: { fontSize: 24, color: 'gray', marginVertical: 10 },
  modalTranslation: { fontSize: 24, color: 'black', marginBottom: 20 },
  buttonRow: { flexDirection: 'row', gap: 12 },
});

export default EnglishLearningApp;
