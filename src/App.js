import React, { useState } from 'react';

// 主應用程式組件
function App() {
  // 用於儲存已選擇的圖片檔案陣列
  const [selectedImages, setSelectedImages] = useState([]);
  // 用於顯示圖片預覽的 URL 陣列
  const [imagePreviewUrls, setImagePreviewUrls] = useState([]);
  // 用於儲存辨識出的英文單字及其中文翻譯
  const [extractedWords, setExtractedWords] = useState([]);
  // 載入狀態指示器
  const [loading, setLoading] = useState(false);
  // 錯誤訊息
  const [errorMessage, setErrorMessage] = useState('');

  // 處理圖片選擇
  const handleImageChange = (event) => {
    const files = Array.from(event.target.files); // 將 FileList 轉換為陣列
    if (files.length > 0) {
      setSelectedImages(files);
      // 為每個檔案建立物件 URL 以供預覽
      const urls = files.map(file => URL.createObjectURL(file));
      setImagePreviewUrls(urls);
      setExtractedWords([]); // 清空先前的辨識結果
      setErrorMessage(''); // 清空錯誤訊息
    } else {
      setSelectedImages([]);
      setImagePreviewUrls([]);
    }
  };

  // 處理圖片分析
  const analyzeImage = async () => {
    if (selectedImages.length === 0) {
      setErrorMessage('請先選擇至少一張圖片！');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setExtractedWords([]); // 清空先前的結果

    const allExtractedWords = [];
    const uniqueWordSet = new Set(); // 用於追蹤已添加的唯一英文單字 (小寫)

    try {
      for (const selectedImage of selectedImages) {
        // 將圖片轉換為 Base64 格式
        const reader = new FileReader();
        reader.readAsDataURL(selectedImage);

        // 使用 Promise 等待 FileReader 完成讀取
        const base64ImageData = await new Promise((resolve) => {
          reader.onloadend = () => {
            resolve(reader.result.split(',')[1]);
          };
        });

        // 準備傳送給 Gemini API 的請求內容，要求以 JSON 格式返回英文單字及中文翻譯
        const prompt = "從這張圖片中，請列出最主要的英文單字，並提供它們的中文翻譯。請以 JSON 陣列的形式回應，每個物件包含 'englishWord' 和 'chineseTranslation' 欄位。例如：[{ \"englishWord\": \"example\", \"chineseTranslation\": \"範例\" }]";

        const payload = {
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: selectedImage.type, // 使用圖片的 MIME 類型
                    data: base64ImageData
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json", // 設定回應為 JSON 格式
            responseSchema: { // 定義回應的 JSON 結構
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  "englishWord": { "type": "STRING" },
                  "chineseTranslation": { "type": "STRING" }
                },
                "propertyOrdering": ["englishWord", "chineseTranslation"]
              }
            }
          }
        };

        const apiKey = ""; // API 金鑰，由執行環境提供
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
          const jsonText = result.candidates[0].content.parts[0].text;
          const parsedJson = JSON.parse(jsonText); // 解析 JSON 字串

          // 過濾掉無效的條目，確保 englishWord 和 chineseTranslation 存在且不為空
          const validWords = parsedJson.filter(item =>
            item.englishWord && item.englishWord.trim() !== '' &&
            item.chineseTranslation && item.chineseTranslation.trim() !== ''
          );

          // 將有效單字添加到總列表中，並確保唯一性
          validWords.forEach(item => {
            const lowerCaseWord = item.englishWord.toLowerCase();
            if (!uniqueWordSet.has(lowerCaseWord)) {
              allExtractedWords.push(item);
              uniqueWordSet.add(lowerCaseWord);
            }
          });

        } else {
          // 如果某張圖片沒有辨識到文字，不設置錯誤訊息，而是繼續處理下一張
          console.warn(`圖片 ${selectedImage.name} 未辨識到主要英文單字。`);
        }
      } // 結束所有圖片的迴圈

      setExtractedWords(allExtractedWords);

      if (allExtractedWords.length === 0) {
        setErrorMessage('未從任何圖片中辨識到主要的英文單字。');
      }

    } catch (error) {
      console.error('圖片分析錯誤:', error);
      // 檢查是否為 JSON 解析錯誤
      if (error instanceof SyntaxError) {
        setErrorMessage('文字辨識結果格式不正確，請嘗試其他圖片或稍後再試。');
      } else {
        setErrorMessage('文字辨識失敗，請稍後再試。');
      }
    } finally {
      setLoading(false);
    }
  };

  // 匯出試算表為 CSV 檔案
  const exportToCsv = () => {
    if (extractedWords.length === 0) {
      setErrorMessage('沒有可匯出的單字。');
      return;
    }

    const headers = ["英文單字", "中文翻譯"];
    // 簡單的 CSV 轉義函數：如果內容包含逗號或雙引號，則用雙引號括起來，並將內部雙引號替換為兩個雙引號
    const escapeCsv = (value) => {
      if (value === null || value === undefined) return '';
      let stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    const rows = extractedWords.map(item =>
      `${escapeCsv(item.englishWord)},${escapeCsv(item.chineseTranslation)}`
    ).join('\n');

    const csvContent = `${headers.join(',')}\n${rows}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', '英文生字字卡.csv');
    link.style.visibility = 'hidden'; // 隱藏連結
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link); // 清理
    URL.revokeObjectURL(url); // 釋放物件 URL
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex flex-col items-center justify-center p-4 font-sans text-gray-800">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-3xl transform hover:scale-105 transition-transform duration-300">
        <h1 className="text-4xl font-extrabold text-center text-gray-900 mb-8 tracking-tight">
          圖片英文生字辨識與翻譯
        </h1>

        <div className="mb-6">
          <label htmlFor="image-upload" className="block text-lg font-semibold text-gray-700 mb-2">
            上傳圖片：(可選取多張)
          </label>
          <input
            type="file"
            id="image-upload"
            accept="image/*"
            multiple // 允許選擇多個檔案
            onChange={handleImageChange}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100 cursor-pointer rounded-lg border border-gray-300 p-2 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {imagePreviewUrls.length > 0 && (
          <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50 text-center">
            <h2 className="text-xl font-semibold text-gray-800 mb-3">圖片預覽：</h2>
            <div className="flex flex-wrap justify-center gap-4 max-h-60 overflow-y-auto p-2">
              {imagePreviewUrls.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`圖片預覽 ${index + 1}`}
                  className="w-32 h-32 object-contain rounded-lg shadow-md border border-gray-200"
                  onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/128x128/e0e0e0/555555?text=載入失敗"; }}
                />
              ))}
            </div>
          </div>
        )}

        <button
          onClick={analyzeImage}
          disabled={loading || selectedImages.length === 0}
          className="w-full bg-gradient-to-r from-green-500 to-teal-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg
            hover:from-green-600 hover:to-teal-700 transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-teal-300 disabled:opacity-50 disabled:cursor-not-allowed text-xl"
        >
          {loading ? '辨識中...' : '分析圖片文字'}
        </button>

        {errorMessage && (
          <div className="mt-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center font-medium">
            {errorMessage}
          </div>
        )}

        {extractedWords.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-5 text-center">
              辨識結果 - 英文生字字卡
            </h2>
            <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-md">
              <table className="min-w-full divide-y divide-gray-200 bg-white">
                <thead className="bg-blue-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-tl-lg">
                      英文單字
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-tr-lg">
                      中文翻譯
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {extractedWords.map((item, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-lg text-gray-900 font-medium">
                        {item.englishWord}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-base text-gray-700">
                        {item.chineseTranslation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm text-gray-600 text-center">
              *此列表僅包含辨識到的主要英文單字及其翻譯。
            </p>
            <button
              onClick={exportToCsv}
              className="mt-6 w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg
                hover:from-indigo-600 hover:to-purple-700 transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-purple-300 text-xl"
            >
              匯出字卡試算表 (.csv)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
