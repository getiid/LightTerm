import { StatusBar } from 'expo-status-bar'
import React from 'react'
import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'

const categories = ['全部', '生产', '测试', '默认']
const hosts = [
  { name: 'Prod-API', host: '10.0.0.12', user: 'root', category: '生产' },
  { name: 'Staging-Web', host: '10.0.1.8', user: 'deploy', category: '测试' },
]

export default function App() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.brand}>AstraShell iOS</Text>
        <Text style={styles.sub}>移动端原型（SSH 列表 + 编辑预留）</Text>
      </View>

      <View style={styles.container}>
        <View style={styles.left}>
          <Text style={styles.title}>分类</Text>
          {categories.map((c) => (
            <Pressable key={c} style={styles.catBtn}>
              <Text>{c}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.right}>
          <Text style={styles.title}>SSH 列表</Text>
          <ScrollView>
            {hosts.map((h) => (
              <Pressable key={h.name} style={styles.card}>
                <Text style={styles.cardTitle}>{h.name}</Text>
                <Text style={styles.cardSub}>{h.host} · {h.user} · {h.category}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  brand: { fontSize: 22, fontWeight: '700', color: '#0F172A' },
  sub: { marginTop: 2, color: '#64748B' },
  container: { flex: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingBottom: 12 },
  left: { width: 110, backgroundColor: '#E5E7EB', borderRadius: 12, padding: 10 },
  right: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 10 },
  title: { fontWeight: '700', marginBottom: 8, color: '#111827' },
  catBtn: { backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 8 },
  card: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, marginBottom: 8 },
  cardTitle: { fontWeight: '600' },
  cardSub: { color: '#6B7280', marginTop: 2, fontSize: 12 },
})
