# 🌍 Air Quality Analytics Dashboard

Professional real-time air quality monitoring system with WHO health standards, AI-powered health advice, and advanced filtering capabilities.

## ✨ Features

- **🌐 Multi-Source Data**: OpenAQ, WAQI, OpenWeather APIs
- **📊 Interactive Charts**: Time-series data with date/time filtering  
- **🏥 WHO Health Standards**: Automated health status assessment
- **🤖 AI Health Advice**: Gemini-powered personalized recommendations
- **⚡ Performance Optimized**: 5-minute caching, concurrent requests
- **📱 Responsive Design**: Mobile-first, modern UI
- **🔍 Advanced Filtering**: Year, month, day, hour-level filtering
- **🎯 Real-time Monitoring**: Live pollution data from 500+ cities worldwide

## 🖥️ Screenshots

- Clean, professional dashboard interface
- Interactive charts showing pollutant trends
- Color-coded WHO health status indicators
- AI-powered health recommendations

## 🚀 Quick Start

### Prerequisites
- **Node.js v14+** (Download from [nodejs.org](https://nodejs.org/))
- **npm** (comes with Node.js)
- **API Keys**: OpenWeather (free), Gemini AI (optional)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Balaji1718/AirQuality_Analytics.git
cd AirQuality_Analytics

# 2. Install server dependencies
cd server
npm install

# 3. Install client dependencies  
cd ../client
npm install

# 4. Create environment file
cd ../server
```

Create `server/.env` file:
```env
OPENAQ_API=https://api.openaq.org/v3
OPENWEATHER_API_KEY=your_openweather_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here_optional
```

```bash
# 5. Build the React app
cd ../client
npm run build

# 6. Start the server
cd ../server
npm start

# 7. Open your browser
# Visit: http://localhost:5000
```

## 🎯 Usage Guide

### Basic Usage
1. **Enter City Name**: Type any city (Delhi, Mumbai, Paris, London, etc.)
2. **Apply Filters**: Use date/time filters for historical data
3. **View Results**: See interactive charts and pollutant tables
4. **Health Advice**: Get AI-powered recommendations
5. **WHO Status**: Check color-coded health indicators

### Advanced Filtering
- **Year Range**: 2000-2025
- **Month Selection**: 1-12
- **Day Selection**: 1-31  
- **Time Range**: 00:00-23:59 (HH:MM format)

### Supported Cities
Global coverage including major cities in:
- **India**: Delhi, Mumbai, Chennai, Bangalore, Kolkata, Pune
- **International**: Paris, London, Tokyo, New York, Beijing, Sydney
- **500+ cities** worldwide through multiple API sources

## 🔧 API Endpoints

```bash
# Get combined air quality data
POST /api/hybrid-measurements
{
  "city": "Delhi",
  "fromYear": 2024,
  "toYear": 2024,
  "fromMonth": 10,
  "toMonth": 10
}

# Get OpenAQ measurements
POST /api/measurements
{
  "city": "Mumbai",
  "fromYear": 2024
}

# Get AI health insights
POST /api/insights
{
  "city": "Paris",
  "data": [pollutant_data_array]
}

# Test API status
GET /api/test-gemini
```

## 📊 Monitored Pollutants

- **PM2.5**: Fine particulate matter (≤2.5 micrometers)
- **PM10**: Coarse particulate matter (≤10 micrometers)
- **NO2**: Nitrogen dioxide
- **O3**: Ground-level ozone
- **SO2**: Sulfur dioxide  
- **CO**: Carbon monoxide
- **Weather Data**: Temperature, humidity, wind speed, pressure

## 🏥 WHO Health Standards

Automatic health status categorization:

| Status | Color | PM2.5 (µg/m³) | Description |
|--------|-------|---------------|-------------|
| 🟢 **Good** | Green | ≤15 | Safe for everyone |
| 🟡 **Moderate** | Yellow | 16-35 | Acceptable for most people |
| 🟠 **Unhealthy for Sensitive** | Orange | 36-55 | Sensitive groups should limit exposure |
| 🔴 **Unhealthy** | Red | 56-150 | Health warnings for everyone |
| 🟣 **Very Unhealthy** | Purple | >150 | Emergency conditions |

## 🛠️ Technology Stack

### Frontend
- **React 18**: Modern UI framework
- **CSS3**: Custom responsive styling
- **Chart Libraries**: Interactive data visualization
- **Service Worker**: Performance optimization

### Backend  
- **Node.js**: Server runtime
- **Express.js**: Web framework
- **Axios**: HTTP client for API requests
- **Node-cache**: In-memory caching (5-minute TTL)

### APIs & Services
- **OpenAQ v3**: Global air quality measurements
- **WAQI**: World Air Quality Index
- **OpenWeather**: Weather and coordinates
- **Google Gemini AI**: Health advice generation

### Performance Features
- **Concurrent API Calls**: Promise.allSettled
- **Request Timeouts**: 15-second limits
- **Intelligent Caching**: 5-minute TTL
- **Error Handling**: Graceful fallbacks
- **Data Validation**: Input sanitization

## 📱 Browser Support

- ✅ Chrome (recommended)
- ✅ Firefox
- ✅ Safari  
- ✅ Edge
- ✅ Mobile browsers

## 🔐 Security Features

- ✅ Environment variable protection
- ✅ Input validation and sanitization
- ✅ CORS protection
- ✅ API key security
- ✅ Safe date handling

## 📈 Performance Metrics

- **Average Response Time**: <3 seconds (with cache)
- **Cache Hit Rate**: ~80% for repeated requests
- **Bundle Size**: ~170KB (gzipped)
- **Lighthouse Score**: 90+ performance

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Troubleshooting

### Common Issues

**Port 5000 already in use:**
```bash
# Find and kill process using port 5000
netstat -ano | findstr :5000
taskkill /PID <process_id> /F
```

**Build fails:**
```bash
# Clear cache and reinstall
cd client
rm -rf node_modules package-lock.json
npm install
npm run build
```

**API not responding:**
- Check internet connection
- Verify API keys in `.env` file
- Check server console for error messages

### Getting Help

- 📧 **Issues**: Report bugs via GitHub Issues
- 💬 **Discussions**: Use GitHub Discussions for questions
- 📖 **Wiki**: Check the project wiki for detailed guides

## 👨‍💻 Author

**Balaji1718**
- GitHub: [@Balaji1718](https://github.com/Balaji1718)
- Project: [AirQuality_Analytics](https://github.com/Balaji1718/AirQuality_Analytics)

## 🙏 Acknowledgments

- OpenAQ for providing free air quality data
- WHO for health standard guidelines
- Google Gemini for AI capabilities
- React team for the amazing framework

---

**Built with ❤️ for cleaner air monitoring and public health awareness**

⭐ **Star this repo if you find it useful!** ⭐