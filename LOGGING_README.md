# 🚀 Smart Logging System

## 📋 Genel Bakış

InteractiveAvatar uygulamasında performans sorunlarını önlemek için akıllı bir logging sistemi uygulanmıştır. Bu sistem:

- ✅ **Buffer Limiti**: Sadece son 100 log'u tutar (memory overflow önlemi)
- ✅ **Log Seviyeleri**: 5 farklı seviye (ERROR, WARN, INFO, DEBUG, TRACE)
- ✅ **Environment Kontrolü**: Development vs Production otomatik ayarı
- ✅ **Timestamp**: Her log'da otomatik zaman damgası
- ✅ **Performans**: Production'da gereksiz log'lar otomatik devre dışı

## 🔧 Log Seviyeleri

| Seviye | Kod | Açıklama | Production'da Görüntülenir |
|--------|-----|----------|---------------------------|
| **ERROR** | 0 | Kritik hatalar | ✅ |
| **WARN** | 1 | Uyarılar | ✅ |
| **INFO** | 2 | Bilgilendirme | ❌ |
| **DEBUG** | 3 | Geliştirme bilgileri | ❌ |
| **TRACE** | 4 | Detaylı izleme | ❌ |

## 🎛️ Konfigürasyon

### Environment Variables

`.env` dosyasında log seviyesini ayarlayın:

```bash
# Mevcut seviyeler: ERROR, WARN, INFO, DEBUG, TRACE
NEXT_PUBLIC_LOG_LEVEL="DEBUG"  # Development için
NEXT_PUBLIC_LOG_LEVEL="WARN"   # Production için önerilen
```

### Otomatik Varsayılanlar

- **Development**: DEBUG seviyesi (tüm log'lar görünür)
- **Production**: WARN seviyesi (sadece hatalar ve uyarılar)

## 📝 Kullanım Örnekleri

```typescript
import { logger } from './path/to/logger';

// Kritik hatalar (her zaman görünür)
logger.error("Payment failed", { userId: 123, amount: 50 });

// Uyarılar (production'da görünür)
logger.warn("Rate limit approaching", { currentRate: 95 });

// Bilgilendirme (sadece development)
logger.info("User logged in", { username: "john" });

// Debug bilgileri (sadece development)
logger.debug("API response received", responseData);

// Detaylı izleme (sadece development)
logger.trace("Function called with params", params);
```

## 🔍 Buffer Yönetimi

```typescript
// Log buffer'ını görüntüle (sadece development'da çalışır)
logger.showBuffer();

// Buffer'ı temizle
logger.clearBuffer();
```

## 🎯 Performans Avantajları

### Önceki Sistem Sorunları:
- ❌ Binlerce console.log birikimi → Memory leak
- ❌ Production'da gereksiz log'lar → CPU overhead
- ❌ Browser console'un şişmesi → Performance düşüşü

### Yeni Sistem Avantajları:
- ✅ **Buffer Limiti**: Sadece son 100 log (memory kontrollü)
- ✅ **Production Optimizasyonu**: Sadece kritik log'lar
- ✅ **Akıllı Filtreleme**: Seviye bazlı otomatik filtreleme
- ✅ **Timestamp**: Organized debugging

## 🚀 Migration Rehberi

### Eski → Yeni Dönüşüm

```typescript
// ❌ ESKİ KULLANIM
console.log("User action");
console.error("Error occurred");
console.warn("Warning message");

// ✅ YENİ KULLANIM
logger.info("User action");     // Development'da görünür
logger.error("Error occurred"); // Her zaman görünür
logger.warn("Warning message"); // Production'da görünür
```

### Seviye Seçimi Rehberi

```typescript
// 🚨 ERROR - Kritik hatalar, uygulama kırılması
logger.error("Database connection failed", error);
logger.error("Payment processing failed", { orderId, userId });

// ⚠️ WARN - Önemli uyarılar, potansiyel sorunlar
logger.warn("API rate limit approaching");
logger.warn("Session timeout warning");

// ℹ️ INFO - Önemli akış bilgileri
logger.info("User authentication successful");
logger.info("Session started", { userId, language });

// 🔍 DEBUG - Geliştirme bilgileri
logger.debug("Config loaded", configData);
logger.debug("API response received", response);

// 🔬 TRACE - Detaylı izleme
logger.trace("Function entry", { params });
logger.trace("State change", { before, after });
```

## 📊 Monitoring

### Development'da Log Monitoring

```typescript
// Console'da log buffer'ını tablo halinde görüntüle
logger.showBuffer();

// Output:
// ┌─────────┬───────────┬─────────┬────────────────────────────────┬────────┐
// │ (index) │ timestamp │  level  │            message             │  data  │
// ├─────────┼───────────┼─────────┼────────────────────────────────┼────────┤
// │    0    │ 14:23:15  │    2    │    'Session started'           │  {...} │
// │    1    │ 14:23:16  │    3    │    'API call completed'        │  {...} │
// └─────────┴───────────┴─────────┴────────────────────────────────┴────────┘
```

### Production'da Log Monitoring

Production'da sadece ERROR ve WARN seviyelerindeki log'lar görünür, bu da:
- Browser console'un temiz kalmasını sağlar
- Performance overhead'ini minimizes eder
- Sadece kritik bilgilerin görünmesini garanti eder

## 🔄 Güncellemeler

Bu logging sistemi ile:

1. **Memory Leak Önlendi**: Buffer sınırı ile kontrollü log tutma
2. **Performance İyileştirildi**: Production'da minimal logging
3. **Debugging Kolaylaştırıldı**: Structured logging ve timestamps
4. **Maintainability Arttırıldı**: Centralized logging management

## 💡 En İyi Pratikler

1. **Seviye Seçimi**: Log'ların önemini göz önünde bulundur
2. **Data Privacy**: Sensitive bilgileri log'lama
3. **Performance**: Production'da sadece gerekli log'ları aktvie et
4. **Monitoring**: Development'da buffer'ı düzenli kontrol et
5. **Cleanup**: Gerektiğinde buffer'ı temizle

---

Bu sistem ile uygulama performansınız korunurken, etkili debugging de mümkün olacak! 🚀 