package org.ajdapp.nibblespot;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

public class MainActivity extends Activity {
  private static final String HOME = "https://restaurant.ajdapp.org/";
  private static final int LOCATION_PERMISSION_REQUEST = 71;
  private WebView web;
  private View splash;
  private GeolocationPermissions.Callback geoCallback;
  private String geoOrigin;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.rgb(249,245,238));
    getWindow().setNavigationBarColor(Color.rgb(249,245,238));
    getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
    FrameLayout root = new FrameLayout(this);
    root.setBackgroundColor(Color.rgb(249,245,238));
    web = new WebView(this);
    web.setBackgroundColor(Color.rgb(249,245,238));
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setGeolocationEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        Uri uri = req.getUrl();
        if ("restaurant.ajdapp.org".equalsIgnoreCase(uri.getHost()) && "https".equalsIgnoreCase(uri.getScheme())) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
        return true;
      }
      @Override public void onPageFinished(WebView view, String url) {
        if(splash != null){splash.setVisibility(View.GONE);}
      }
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
          callback.invoke(origin, true, false);
        } else {
          geoOrigin = origin;geoCallback = callback;
          requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_PERMISSION_REQUEST);
        }
      }
    });
    root.addView(web,new FrameLayout.LayoutParams(-1,-1));
    LinearLayout loading=new LinearLayout(this);
    loading.setOrientation(LinearLayout.VERTICAL);
    loading.setGravity(Gravity.CENTER);
    loading.setBackgroundColor(Color.rgb(249,245,238));
    TextView mark=new TextView(this);mark.setText("♡");mark.setTextSize(68);mark.setTextColor(Color.rgb(173,92,69));mark.setGravity(Gravity.CENTER);
    loading.addView(mark);
    TextView name=new TextView(this);name.setText("NibbleSpot");name.setTextSize(34);name.setTypeface(android.graphics.Typeface.SERIF,android.graphics.Typeface.BOLD);name.setTextColor(Color.rgb(61,43,36));name.setGravity(Gravity.CENTER);
    loading.addView(name);
    TextView line=new TextView(this);line.setText("OUR TABLE · OUR ADVENTURES");line.setTextSize(11);line.setTextColor(Color.rgb(154,110,86));line.setLetterSpacing(.2f);line.setGravity(Gravity.CENTER);
    loading.addView(line);
    ProgressBar progress=new ProgressBar(this);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(48,48);p.topMargin=36;loading.addView(progress,p);
    splash=loading;root.addView(loading,new FrameLayout.LayoutParams(-1,-1));
    setContentView(root);
    web.loadUrl(HOME);
  }

  @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults){
    super.onRequestPermissionsResult(requestCode,permissions,grantResults);
    if(requestCode==LOCATION_PERMISSION_REQUEST && geoCallback != null){
      boolean granted=false;for(int status:grantResults){if(status==PackageManager.PERMISSION_GRANTED)granted=true;}
      geoCallback.invoke(geoOrigin,granted,false);geoCallback=null;geoOrigin=null;
    }
  }

  @Override @Deprecated public void onBackPressed() {
    if(web!=null&&web.canGoBack()){web.goBack();}else{super.onBackPressed();}
  }
  @Override protected void onDestroy(){if(web!=null){web.destroy();web=null;}super.onDestroy();}
}
