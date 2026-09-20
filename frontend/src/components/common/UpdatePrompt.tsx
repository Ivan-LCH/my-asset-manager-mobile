/// <reference types="vite-plugin-pwa/client" />
import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export default function UpdatePrompt() {
  const [error,setError]=useState('')
  const {needRefresh:[needRefresh,setNeedRefresh],offlineReady:[offlineReady,setOfflineReady],updateServiceWorker}=useRegisterSW({onRegisterError:e=>setError(String(e))})
  if(!needRefresh&&!offlineReady&&!error)return null
  return <aside role="status" className="fixed z-[70] bottom-20 right-3 left-3 sm:left-auto sm:max-w-sm bg-slate-800 text-slate-100 border border-slate-500 rounded-xl p-4 shadow-xl text-sm">
    <p>{error?'오프라인 준비/업데이트 실패: '+error:needRefresh?'새 앱 버전이 준비되었습니다. 저장한 뒤 적용하세요.':'오프라인 실행 준비가 되었습니다. 시세 조회와 Drive는 온라인 연결이 필요합니다.'}</p>
    <div className="flex gap-3 mt-3">{needRefresh&&<button className="bg-blue-600 rounded px-4 py-3" onClick={()=>{if(window.confirm('저장하지 않은 입력을 확인하셨나요? 새 버전을 적용하면 화면이 새로고침됩니다.'))void updateServiceWorker(true).catch(e=>setError(String(e)))}}>저장 확인 후 업데이트</button>}<button className="border border-slate-500 rounded px-4 py-3" onClick={()=>{setNeedRefresh(false);setOfflineReady(false);setError('')}}>나중에</button></div>
  </aside>
}
