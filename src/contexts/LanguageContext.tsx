import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface Language {
  code: string;
  name: string;
  flag: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'ha', name: 'Hausa', flag: '🇳🇬' },
  { code: 'sw', name: 'Swahili', flag: '🇿🇦' },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
];

export type TranslationKey =
  | 'dashboard' | 'market' | 'myStore' | 'myOrders' | 'sales' | 'refer'
  | 'profile' | 'postAd' | 'jobBoard' | 'myDrafts' | 'chat' | 'adminPanel'
  | 'notifications' | 'activityFeed' | 'notificationPrefs' | 'securityCenter' | 'settings'
  | 'signOut' | 'signIn' | 'signUp' | 'language' | 'home' | 'wallet'
  | 'products' | 'jobs' | 'contact' | 'visitStore' | 'storeDescription'
  | 'storeLocation' | 'customize' | 'saveStore' | 'cancel' | 'storeTitle'
  | 'bannerImage' | 'uploadBanner' | 'remove' | 'themeSettings' | 'color'
  | 'design' | 'customUpload' | 'mixMatch' | 'preDesigned' | 'livePreview'
  | 'applyTheme' | 'description' | 'noProducts' | 'noJobs' | 'backToMarket'
  | 'search' | 'reviews' | 'free'
  | 'campaigns'
  | 'rewards'
  | 'creatorCampaigns'
  | 'affiliateCenter' | 'vendorCenter' | 'buyerDashboard'
  | 'savedItems' | 'messages' | 'helpSupport' | 'tutorials'
  | 'announcements' | 'challenges' | 'contactSupport'
  | 'termsPolicies' | 'continueBrowsing' | 'recentlyViewed'
  | 'clearHistory' | 'newProducts' | 'highestRanked'
  | 'recommendedForYou' | 'allProducts' | 'browseListings'
  | 'searchMenu' | 'noResults' | 'gridView' | 'listView';

type Translations = Record<TranslationKey, string>;

const TRANSLATIONS: Record<string, Translations> = {
  en: {
    dashboard: 'Dashboard', market: 'Market', myStore: 'My Store', myOrders: 'My Orders',
    sales: 'Sales', refer: 'Refer', profile: 'Profile', postAd: 'Post Ad',
    jobBoard: 'Job Board', myDrafts: 'My Drafts', campaigns: 'Campaigns', rewards: 'Rewards', chat: 'Chat', notifications: 'Notifications', activityFeed: 'Activity Feed', notificationPrefs: 'Notification Settings', securityCenter: 'Security Center', settings: 'Settings', adminPanel: 'Admin Panel',
    signOut: 'Sign Out', signIn: 'Sign In', signUp: 'Sign Up', language: 'Language',
    home: 'Home', wallet: 'Wallet', products: 'Products', jobs: 'Jobs', contact: 'Contact',
    visitStore: 'Visit Store', storeDescription: 'Store Description', storeLocation: 'Store Location',
    customize: 'Customize', saveStore: 'Save Store', cancel: 'Cancel', storeTitle: 'Store Title',
    bannerImage: 'Banner Image', uploadBanner: 'Upload Banner', remove: 'Remove',
    themeSettings: 'Theme Settings', color: 'Color', design: 'Design', customUpload: 'Custom Upload',
    mixMatch: 'Mix & Match', preDesigned: 'Pre-designed Themes', livePreview: 'Live Preview',
    applyTheme: 'Apply Theme', description: 'Description', noProducts: 'No products available yet',
    noJobs: 'No job postings available', backToMarket: 'Back to Marketplace',
    search: 'Search', reviews: 'reviews', free: 'FREE',
    creatorCampaigns: 'Creator Campaigns',
    affiliateCenter: 'Affiliate Center', vendorCenter: 'Vendor Center', buyerDashboard: 'Buyer Dashboard',
    savedItems: 'Saved Items', messages: 'Messages', helpSupport: 'Help & Support', tutorials: 'Tutorials',
    announcements: 'Announcements', challenges: 'Challenges', contactSupport: 'Contact Support',
    termsPolicies: 'Terms & Policies', continueBrowsing: 'Continue Browsing', recentlyViewed: 'Recently Viewed',
    clearHistory: 'Clear History', newProducts: 'New Products', highestRanked: 'Highest Ranked',
    recommendedForYou: 'Recommended For You', allProducts: 'All Products', browseListings: 'Browse Listings',
    searchMenu: 'Search menu', noResults: 'No results found', gridView: 'Grid View', listView: 'List View',
  },
  fr: {
    dashboard: 'Tableau de bord', market: 'Marché', myStore: 'Ma Boutique', myOrders: 'Mes Commandes',
    sales: 'Ventes', refer: 'Parrainer', profile: 'Profil', postAd: 'Publier',
    jobBoard: 'Offres d\'emploi', myDrafts: 'Mes Brouillons', campaigns: 'Campagnes', rewards: 'Récompenses', chat: 'Chat', notifications: 'Notifications', activityFeed: "Flux d'Activité", notificationPrefs: 'Paramètres de Notification', securityCenter: 'Centre de Sécurité', settings: 'Paramètres', adminPanel: 'Panel Admin',
    signOut: 'Déconnexion', signIn: 'Connexion', signUp: 'Inscription', language: 'Langue',
    home: 'Accueil', wallet: 'Portefeuille', products: 'Produits', jobs: 'Emplois', contact: 'Contacter',
    visitStore: 'Visiter la Boutique', storeDescription: 'Description de la Boutique', storeLocation: 'Emplacement',
    customize: 'Personnaliser', saveStore: 'Enregistrer', cancel: 'Annuler', storeTitle: 'Nom de la Boutique',
    bannerImage: 'Image de Bannière', uploadBanner: 'Télécharger', remove: 'Retirer',
    themeSettings: 'Paramètres du Thème', color: 'Couleur', design: 'Design', customUpload: 'Téléchargement Personnalisé',
    mixMatch: 'Mix & Match', preDesigned: 'Thèmes Préconçus', livePreview: 'Aperçu en Direct',
    applyTheme: 'Appliquer le Thème', description: 'Description', noProducts: 'Aucun produit disponible',
    noJobs: 'Aucune offre d\'emploi disponible', backToMarket: 'Retour au Marché',
    search: 'Rechercher', reviews: 'avis', free: 'GRATUIT',
    creatorCampaigns: 'Campagnes Créateurs',
    affiliateCenter: 'Centre d\'Affiliation', vendorCenter: 'Espace Vendeur', buyerDashboard: 'Tableau Acheteur',
    savedItems: 'Éléments Sauvegardés', messages: 'Messages', helpSupport: 'Aide & Support', tutorials: 'Tutoriels',
    announcements: 'Annonces', challenges: 'Défis', contactSupport: 'Contacter le Support',
    termsPolicies: 'Conditions & Politiques', continueBrowsing: 'Continuer la Navigation', recentlyViewed: 'Vus Récemment',
    clearHistory: 'Effacer l\'Historique', newProducts: 'Nouveaux Produits', highestRanked: 'Les Mieux Classés',
    recommendedForYou: 'Recommandés Pour Vous', allProducts: 'Tous les Produits', browseListings: 'Parcourir les Annonces',
    searchMenu: 'Rechercher dans le menu', noResults: 'Aucun résultat trouvé', gridView: 'Vue Grille', listView: 'Vue Liste',
  },
  es: {
    dashboard: 'Panel', market: 'Mercado', myStore: 'Mi Tienda', myOrders: 'Mis Pedidos',
    sales: 'Ventas', refer: 'Referir', profile: 'Perfil', postAd: 'Publicar',
    jobBoard: 'Empleos', myDrafts: 'Mis Borradores', campaigns: 'Campañas', rewards: 'Recompensas', chat: 'Chat', notifications: 'Notificaciones', activityFeed: 'Feed de Actividad', notificationPrefs: 'Configuración de Notificaciones', securityCenter: 'Centro de Seguridad', settings: 'Configuración', adminPanel: 'Panel Admin',
    signOut: 'Cerrar Sesión', signIn: 'Iniciar Sesión', signUp: 'Registrarse', language: 'Idioma',
    home: 'Inicio', wallet: 'Cartera', products: 'Productos', jobs: 'Empleos', contact: 'Contactar',
    visitStore: 'Visitar Tienda', storeDescription: 'Descripción de la Tienda', storeLocation: 'Ubicación',
    customize: 'Personalizar', saveStore: 'Guardar Tienda', cancel: 'Cancelar', storeTitle: 'Nombre de la Tienda',
    bannerImage: 'Imagen de Banner', uploadBanner: 'Subir Banner', remove: 'Quitar',
    themeSettings: 'Configuración del Tema', color: 'Color', design: 'Diseño', customUpload: 'Subida Personalizada',
    mixMatch: 'Mix & Match', preDesigned: 'Temas Prediseñados', livePreview: 'Vista Previa',
    applyTheme: 'Aplicar Tema', description: 'Descripción', noProducts: 'No hay productos disponibles',
    noJobs: 'No hay ofertas de trabajo disponibles', backToMarket: 'Volver al Mercado',
    search: 'Buscar', reviews: 'reseñas', free: 'GRATIS',
    creatorCampaigns: 'Campañas de Creadores',
    affiliateCenter: 'Centro de Afiliados', vendorCenter: 'Centro de Vendedores', buyerDashboard: 'Panel de Comprador',
    savedItems: 'Elementos Guardados', messages: 'Mensajes', helpSupport: 'Ayuda y Soporte', tutorials: 'Tutoriales',
    announcements: 'Anuncios', challenges: 'Desafíos', contactSupport: 'Contactar Soporte',
    termsPolicies: 'Términos y Políticas', continueBrowsing: 'Continuar Navegando', recentlyViewed: 'Vistos Recientemente',
    clearHistory: 'Borrar Historial', newProducts: 'Productos Nuevos', highestRanked: 'Mejor Clasificados',
    recommendedForYou: 'Recomendados Para Ti', allProducts: 'Todos los Productos', browseListings: 'Explorar Anuncios',
    searchMenu: 'Buscar en menú', noResults: 'No se encontraron resultados', gridView: 'Vista de Cuadrícula', listView: 'Vista de Lista',
  },
  de: {
    dashboard: 'Übersicht', market: 'Markt', myStore: 'Mein Laden', myOrders: 'Meine Bestellungen',
    sales: 'Verkäufe', refer: 'Werben', profile: 'Profil', postAd: 'Anzeige',
    jobBoard: 'Jobs', myDrafts: 'Meine Entwürfe', campaigns: 'Kampagnen', rewards: 'Belohnungen', chat: 'Chat', notifications: 'Notifications', activityFeed: 'Benachrichtigungen', notificationPrefs: 'Configuración de Notificaciones', securityCenter: 'Sicherheitscenter', settings: 'Einstellungen',  adminPanel: 'Admin-Panel',
    signOut: 'Abmelden', signIn: 'Anmelden', signUp: 'Registrieren', language: 'Sprache',
    home: 'Startseite', wallet: 'Geldbörse', products: 'Produkte', jobs: 'Jobs', contact: 'Kontakt',
    visitStore: 'Laden Besuchen', storeDescription: 'Ladenbeschreibung', storeLocation: 'Standort',
    customize: 'Anpassen', saveStore: 'Speichern', cancel: 'Abbrechen', storeTitle: 'Ladenname',
    bannerImage: 'Bannerbild', uploadBanner: 'Banner Hochladen', remove: 'Entfernen',
    themeSettings: 'Theme-Einstellungen', color: 'Farbe', design: 'Design', customUpload: 'Benutzerdefinierter Upload',
    mixMatch: 'Mix & Match', preDesigned: 'Vorgefertigte Themes', livePreview: 'Live-Vorschau',
    applyTheme: 'Theme Anwenden', description: 'Beschreibung', noProducts: 'Keine Produkte verfügbar',
    noJobs: 'Keine Jobangebote verfügbar', backToMarket: 'Zum Markt Zurück',
    search: 'Suchen', reviews: 'Bewertungen', free: 'KOSTENLOS',
    creatorCampaigns: 'Ersteller-Kampagnen',
    affiliateCenter: 'Affiliate-Center', vendorCenter: 'Verkäuferzentrum', buyerDashboard: 'Käufer-Dashboard',
    savedItems: 'Gespeicherte Elemente', messages: 'Nachrichten', helpSupport: 'Hilfe & Support', tutorials: 'Tutorials',
    announcements: 'Ankündigungen', challenges: 'Herausforderungen', contactSupport: 'Support Kontaktieren',
    termsPolicies: 'AGB & Richtlinien', continueBrowsing: 'Weiter Stöbern', recentlyViewed: 'Zuletzt Angesehen',
    clearHistory: 'Verlauf Löschen', newProducts: 'Neue Produkte', highestRanked: 'Am Besten Bewertet',
    recommendedForYou: 'Für Dich Empfohlen', allProducts: 'Alle Produkte', browseListings: 'Anzeigen Durchsuchen',
    searchMenu: 'Menü durchsuchen', noResults: 'Keine Ergebnisse gefunden', gridView: 'Gitteransicht', listView: 'Listenansicht',
  },
  ar: {
    dashboard: 'لوحة التحكم', market: 'السوق', myStore: 'متجري', myOrders: 'طلباتي',
    sales: 'المبيعات', refer: 'إحالة', profile: 'الملف الشخصي', postAd: 'إعلان',
    jobBoard: 'الوظائف', myDrafts: 'مسوداتي', campaigns: 'الحملات', rewards: 'المكافآت', chat: 'دردشة', notifications: 'الإشعارات', activityFeed: 'سجل النشاط', notificationPrefs: 'إعدادات الإشعارات', securityCenter: 'مركز الأمان', settings: 'الإعدادات', adminPanel: 'لوحة الإدارة',
    signOut: 'تسجيل الخروج', signIn: 'تسجيل الدخول', signUp: 'التسجيل', language: 'اللغة',
    home: 'الرئيسية', wallet: 'المحفظة', products: 'المنتجات', jobs: 'الوظائف', contact: 'اتصل',
    visitStore: 'زيارة المتجر', storeDescription: 'وصف المتجر', storeLocation: 'الموقع',
    customize: 'تخصيص', saveStore: 'حفظ المتجر', cancel: 'إلغاء', storeTitle: 'اسم المتجر',
    bannerImage: 'صورة البانر', uploadBanner: 'رفع البانر', remove: 'إزالة',
    themeSettings: 'إعدادات المظهر', color: 'اللون', design: 'التصميم', customUpload: 'رفع مخصص',
    mixMatch: 'خلط ومطابقة', preDesigned: 'ثيمات جاهزة', livePreview: 'معاينة مباشرة',
    applyTheme: 'تطبيق المظهر', description: 'الوصف', noProducts: 'لا توجد منتجات متاحة',
    noJobs: 'لا توجد وظائف متاحة', backToMarket: 'العودة إلى السوق',
    search: 'بحث', reviews: 'مراجعات', free: 'مجاني',
    creatorCampaigns: 'حملات المبدعين',
    affiliateCenter: 'مركز التسويق', vendorCenter: 'مركز البائعين', buyerDashboard: 'لوحة المشتري',
    savedItems: 'العناصر المحفوظة', messages: 'الرسائل', helpSupport: 'المساعدة والدعم', tutorials: 'الدروس',
    announcements: 'الإعلانات', challenges: 'التحديات', contactSupport: 'اتصل بالدعم',
    termsPolicies: 'الشروط والسياسات', continueBrowsing: 'متابعة التصفح', recentlyViewed: 'شوهد مؤخراً',
    clearHistory: 'مسح السجل', newProducts: 'منتجات جديدة', highestRanked: 'الأعلى تصنيفاً',
    recommendedForYou: 'موصى به لك', allProducts: 'جميع المنتجات', browseListings: 'تصفح الإعلانات',
    searchMenu: 'بحث في القائمة', noResults: 'لا توجد نتائج', gridView: 'عرض الشبكة', listView: 'عرض القائمة',
  },
  zh: {
    dashboard: '仪表板', market: '市场', myStore: '我的店铺', myOrders: '我的订单',
    sales: '销售', refer: '推荐', profile: '个人资料', postAd: '发布广告',
    jobBoard: '工作', myDrafts: '我的草稿', campaigns: '广告活动', rewards: '奖励', chat: '聊天', notifications: '通知', activityFeed: '活动动态', notificationPrefs: '通知设置', securityCenter: '安全中心', settings: '设置', adminPanel: '管理面板',
    signOut: '退出', signIn: '登录', signUp: '注册', language: '语言',
    home: '首页', wallet: '钱包', products: '产品', jobs: '工作', contact: '联系',
    visitStore: '访问店铺', storeDescription: '店铺描述', storeLocation: '位置',
    customize: '自定义', saveStore: '保存店铺', cancel: '取消', storeTitle: '店铺名称',
    bannerImage: '横幅图片', uploadBanner: '上传横幅', remove: '移除',
    themeSettings: '主题设置', color: '颜色', design: '设计', customUpload: '自定义上传',
    mixMatch: '混合搭配', preDesigned: '预设主题', livePreview: '实时预览',
    applyTheme: '应用主题', description: '描述', noProducts: '暂无产品',
    noJobs: '暂无工作', backToMarket: '返回市场',
    search: '搜索', reviews: '评论', free: '免费',
    creatorCampaigns: '创作者活动',
    affiliateCenter: '联盟中心', vendorCenter: '卖家中心', buyerDashboard: '买家仪表板',
    savedItems: '收藏项目', messages: '消息', helpSupport: '帮助与支持', tutorials: '教程',
    announcements: '公告', challenges: '挑战', contactSupport: '联系支持',
    termsPolicies: '条款与政策', continueBrowsing: '继续浏览', recentlyViewed: '最近查看',
    clearHistory: '清除历史', newProducts: '新产品', highestRanked: '最高排名',
    recommendedForYou: '为你推荐', allProducts: '所有产品', browseListings: '浏览列表',
    searchMenu: '搜索菜单', noResults: '未找到结果', gridView: '网格视图', listView: '列表视图',
  },
  ja: {
    dashboard: 'ダッシュボード', market: 'マーケット', myStore: 'マイストア', myOrders: '注文履歴',
    sales: '売上', refer: '紹介', profile: 'プロフィール', postAd: '投稿',
    jobBoard: '求人', myDrafts: '下書き', campaigns: 'キャンペーン', rewards: '報酬', chat: 'チャット', notifications: '通知', activityFeed: 'アクティビティ', notificationPrefs: '通知設定', securityCenter: 'セキュリティセンター', settings: '設定', adminPanel: '管理パネル',
    signOut: 'ログアウト', signIn: 'ログイン', signUp: '登録', language: '言語',
    home: 'ホーム', wallet: 'ウォレット', products: '製品', jobs: '求人', contact: '連絡',
    visitStore: 'ストアを見る', storeDescription: 'ストア説明', storeLocation: '所在地',
    customize: 'カスタマイズ', saveStore: '保存', cancel: 'キャンセル', storeTitle: 'ストア名',
    bannerImage: 'バナー画像', uploadBanner: 'アップロード', remove: '削除',
    themeSettings: 'テーマ設定', color: 'カラー', design: 'デザイン', customUpload: 'カスタムアップロード',
    mixMatch: 'ミックス&マッチ', preDesigned: 'プリセットテーマ', livePreview: 'ライブプレビュー',
    applyTheme: 'テーマ適用', description: '説明', noProducts: '製品はありません',
    noJobs: '求人はありません', backToMarket: 'マーケットに戻る',
    search: '検索', reviews: 'レビュー', free: '無料',
    creatorCampaigns: 'クリエイターキャンペーン',
    affiliateCenter: 'アフィリエイトセンター', vendorCenter: 'ベンダーセンター', buyerDashboard: 'バイヤーダッシュボード',
    savedItems: '保存済みアイテム', messages: 'メッセージ', helpSupport: 'ヘルプ＆サポート', tutorials: 'チュートリアル',
    announcements: 'お知らせ', challenges: 'チャレンジ', contactSupport: 'サポートに連絡',
    termsPolicies: '利用規約とポリシー', continueBrowsing: 'ブラウジングを続ける', recentlyViewed: '最近見たもの',
    clearHistory: '履歴を消去', newProducts: '新着商品', highestRanked: '最高ランク',
    recommendedForYou: 'あなたへのおすすめ', allProducts: 'すべての商品', browseListings: 'リストを閲覧',
    searchMenu: 'メニューを検索', noResults: '結果が見つかりません', gridView: 'グリッド表示', listView: 'リスト表示',
  },
  pt: {
    dashboard: 'Painel', market: 'Mercado', myStore: 'Minha Loja', myOrders: 'Meus Pedidos',
    sales: 'Vendas', refer: 'Indicar', profile: 'Perfil', postAd: 'Anunciar',
    jobBoard: 'Empregos', myDrafts: 'Meus Rascunhos', campaigns: 'Campanhas', rewards: 'Recompensas', chat: 'Chat', notifications: 'Notificações', activityFeed: 'Feed de Atividades', notificationPrefs: 'Configurações de Notificação', securityCenter: 'Central de Segurança', settings: 'Configurações', adminPanel: 'Painel Admin',
    signOut: 'Sair', signIn: 'Entrar', signUp: 'Cadastrar', language: 'Idioma',
    home: 'Início', wallet: 'Carteira', products: 'Produtos', jobs: 'Empregos', contact: 'Contato',
    visitStore: 'Visitar Loja', storeDescription: 'Descrição da Loja', storeLocation: 'Localização',
    customize: 'Personalizar', saveStore: 'Salvar Loja', cancel: 'Cancelar', storeTitle: 'Nome da Loja',
    bannerImage: 'Imagem do Banner', uploadBanner: 'Enviar Banner', remove: 'Remover',
    themeSettings: 'Configurações de Tema', color: 'Cor', design: 'Design', customUpload: 'Upload Personalizado',
    mixMatch: 'Mix & Match', preDesigned: 'Temas Prontos', livePreview: 'Pré-visualização',
    applyTheme: 'Aplicar Tema', description: 'Descrição', noProducts: 'Nenhum produto disponível',
    noJobs: 'Nenhuma vaga disponível', backToMarket: 'Voltar ao Mercado',
    search: 'Buscar', reviews: 'avaliações', free: 'GRÁTIS',
    creatorCampaigns: 'Campanhas de Criadores',
    affiliateCenter: 'Centro de Afiliados', vendorCenter: 'Centro de Vendedores', buyerDashboard: 'Painel do Comprador',
    savedItems: 'Itens Salvos', messages: 'Mensagens', helpSupport: 'Ajuda e Suporte', tutorials: 'Tutoriais',
    announcements: 'Anúncios', challenges: 'Desafios', contactSupport: 'Contatar Suporte',
    termsPolicies: 'Termos e Políticas', continueBrowsing: 'Continuar Navegando', recentlyViewed: 'Vistos Recentemente',
    clearHistory: 'Limpar Histórico', newProducts: 'Produtos Novos', highestRanked: 'Melhor Classificados',
    recommendedForYou: 'Recomendados Para Você', allProducts: 'Todos os Produtos', browseListings: 'Navegar Anúncios',
    searchMenu: 'Pesquisar no menu', noResults: 'Nenhum resultado encontrado', gridView: 'Visualização em Grade', listView: 'Visualização em Lista',
  },
  ru: {
    dashboard: 'Панель', market: 'Рынок', myStore: 'Мой Магазин', myOrders: 'Мои Заказы',
    sales: 'Продажи', refer: 'Реферал', profile: 'Профиль', postAd: 'Объявление',
    jobBoard: 'Вакансии', myDrafts: 'Черновики', campaigns: 'Кампании', rewards: 'Награды', chat: 'Чат', notifications: 'Уведомления', activityFeed: 'Лента Активности', notificationPrefs: 'Настройки Уведомлений', securityCenter: 'Центр Безопасности', settings: 'Настройки', adminPanel: 'Админ-панель',
    signOut: 'Выйти', signIn: 'Войти', signUp: 'Регистрация', language: 'Язык',
    home: 'Главная', wallet: 'Кошелёк', products: 'Товары', jobs: 'Вакансии', contact: 'Связаться',
    visitStore: 'Посетить Магазин', storeDescription: 'Описание Магазина', storeLocation: 'Местоположение',
    customize: 'Настроить', saveStore: 'Сохранить', cancel: 'Отмена', storeTitle: 'Название Магазина',
    bannerImage: 'Баннер', uploadBanner: 'Загрузить', remove: 'Удалить',
    themeSettings: 'Настройки Темы', color: 'Цвет', design: 'Дизайн', customUpload: 'Своё Изображение',
    mixMatch: 'Комбинировать', preDesigned: 'Готовые Темы', livePreview: 'Предпросмотр',
    applyTheme: 'Применить', description: 'Описание', noProducts: 'Нет товаров',
    noJobs: 'Нет вакансий', backToMarket: 'Назад на Рынок',
    search: 'Поиск', reviews: 'отзывов', free: 'БЕСПЛАТНО',
    creatorCampaigns: 'Кампании Автором',
    affiliateCenter: 'Центр Партнёра', vendorCenter: 'Центр Продавцов', buyerDashboard: 'Панель Покупателя',
    savedItems: 'Сохранённые Элементы', messages: 'Сообщения', helpSupport: 'Помощь и Поддержка', tutorials: 'Учебники',
    announcements: 'Объявления', challenges: 'Вызовы', contactSupport: 'Связаться с Поддержкой',
    termsPolicies: 'Условия и Политики', continueBrowsing: 'Продолжить Просмотр', recentlyViewed: 'Недавно Просмотренные',
    clearHistory: 'Очистить Историю', newProducts: 'Новые Товары', highestRanked: 'Наивысший Рейтинг',
    recommendedForYou: 'Рекомендуем Для Вас', allProducts: 'Все Товары', browseListings: 'Просмотр Объявлений',
    searchMenu: 'Поиск по меню', noResults: 'Результаты не найдены', gridView: 'Сетка', listView: 'Список',
  },
  hi: {
    dashboard: 'डैशबोर्ड', market: 'बाजार', myStore: 'मेरा स्टोर', myOrders: 'मेरे ऑर्डर',
    sales: 'बिक्री', refer: 'रेफर', profile: 'प्रोफ़ाइल', postAd: 'विज्ञापन',
    jobBoard: 'नौकरियाँ', myDrafts: 'मेरे ड्राफ्ट', campaigns: 'अभियान', rewards: 'पुरस्कार', chat: 'चैट', notifications: 'सूचनाएं', activityFeed: 'गतिविधि फ़ीड', notificationPrefs: 'सूचना सेटिंग्स', securityCenter: 'सुरक्षा केंद्र', settings: 'सेटिंग्स', adminPanel: 'एडमिन पैनल',
    signOut: 'साइन आउट', signIn: 'साइन इन', signUp: 'साइन अप', language: 'भाषा',
    home: 'होम', wallet: 'वॉलेट', products: 'उत्पाद', jobs: 'नौकरियाँ', contact: 'संपर्क',
    visitStore: 'स्टोर देखें', storeDescription: 'स्टोर विवरण', storeLocation: 'स्थान',
    customize: 'अनुकूलित करें', saveStore: 'सहेजें', cancel: 'रद्द करें', storeTitle: 'स्टोर नाम',
    bannerImage: 'बैनर छवि', uploadBanner: 'अपलोड', remove: 'हटाएं',
    themeSettings: 'थीम सेटिंग्स', color: 'रंग', design: 'डिज़ाइन', customUpload: 'कस्टम अपलोड',
    mixMatch: 'मिक्स एंड मैच', preDesigned: 'पूर्व-डिज़ाइन थीम', livePreview: 'लाइव प्रीव्यू',
    applyTheme: 'थीम लागू करें', description: 'विवरण', noProducts: 'कोई उत्पाद उपलब्ध नहीं',
    noJobs: 'कोई नौकरी उपलब्ध नहीं', backToMarket: 'बाजार पर वापस',
    search: 'खोज', reviews: 'समीक्षाएं', free: 'मुफ़्त',
    creatorCampaigns: 'रचनाकार अभियान',
    affiliateCenter: 'सहबद्ध केंद्र', vendorCenter: 'विक्रेता केंद्र', buyerDashboard: 'खरीदार डैशबोर्ड',
    savedItems: 'सहेजे गए आइटम', messages: 'संदेश', helpSupport: 'सहायता और समर्थन', tutorials: 'ट्यूटोरियल',
    announcements: 'घोषणाएं', challenges: 'चुनौतियां', contactSupport: 'समर्थन से संपर्क करें',
    termsPolicies: 'नियम और नीतियां', continueBrowsing: 'ब्राउज़िंग जारी रखें', recentlyViewed: 'हाल ही में देखा',
    clearHistory: 'इतिहास साफ़ करें', newProducts: 'नए उत्पाद', highestRanked: 'उच्चतम रैंकिंग',
    recommendedForYou: 'आपके लिए अनुशंसित', allProducts: 'सभी उत्पाद', browseListings: 'सूची ब्राउज़ करें',
    searchMenu: 'मेनू खोजें', noResults: 'कोई परिणाम नहीं मिला', gridView: 'ग्रिड दृश्य', listView: 'सूची दृश्य',
  },
  ko: {
    dashboard: '대시보드', market: '마켓', myStore: '내 스토어', myOrders: '주문 내역',
    sales: '판매', refer: '추천', profile: '프로필', postAd: '광고',
    jobBoard: '채용', myDrafts: '초안', campaigns: '캠페인', rewards: '보상', chat: '채팅', notifications: '알림', activityFeed: '활동 피드', notificationPrefs: '알림 설정', securityCenter: '보안 센터', settings: '설정', adminPanel: '관리 패널',
    signOut: '로그아웃', signIn: '로그인', signUp: '가입', language: '언어',
    home: '홈', wallet: '지갑', products: '제품', jobs: '채용', contact: '연락',
    visitStore: '스토어 방문', storeDescription: '스토어 설명', storeLocation: '위치',
    customize: '사용자 정의', saveStore: '저장', cancel: '취소', storeTitle: '스토어 이름',
    bannerImage: '배너 이미지', uploadBanner: '업로드', remove: '제거',
    themeSettings: '테마 설정', color: '색상', design: '디자인', customUpload: '사용자 업로드',
    mixMatch: '믹스 & 매치', preDesigned: '기본 테마', livePreview: '실시간 미리보기',
    applyTheme: '테마 적용', description: '설명', noProducts: '제품이 없습니다',
    noJobs: '채용 정보가 없습니다', backToMarket: '마켓으로 돌아가기',
    search: '검색', reviews: '리뷰', free: '무료',
    creatorCampaigns: '크리에이터 캠페인',
    affiliateCenter: '제휴 센터', vendorCenter: '벤더 센터', buyerDashboard: '구매자 대시보드',
    savedItems: '저장된 항목', messages: '메시지', helpSupport: '도움말 및 지원', tutorials: '튜토리얼',
    announcements: '공지사항', challenges: '챌린지', contactSupport: '지원 문의',
    termsPolicies: '약관 및 정책', continueBrowsing: '계속 탐색', recentlyViewed: '최근 본 항목',
    clearHistory: '기록 지우기', newProducts: '신규 제품', highestRanked: '최고 순위',
    recommendedForYou: '추천 상품', allProducts: '모든 제품', browseListings: '목록 탐색',
    searchMenu: '메뉴 검색', noResults: '결과를 찾을 수 없습니다', gridView: '그리드 보기', listView: '목록 보기',
  },
  it: {
    dashboard: 'Cruscotto', market: 'Mercato', myStore: 'Il Mio Negozio', myOrders: 'I Miei Ordini',
    sales: 'Vendite', refer: 'Invita', profile: 'Profilo', postAd: 'Annuncio',
    jobBoard: 'Lavori', myDrafts: 'Bozze', campaigns: 'Campagne', rewards: 'Ricompense', chat: 'Chat', notifications: 'Notifiche', activityFeed: 'Feed Attività', notificationPrefs: 'Impostazioni Notifiche', securityCenter: 'Centro Sicurezza', settings: 'Impostazioni', adminPanel: 'Pannello Admin',
    signOut: 'Esci', signIn: 'Accedi', signUp: 'Registrati', language: 'Lingua',
    home: 'Home', wallet: 'Portafoglio', products: 'Prodotti', jobs: 'Lavori', contact: 'Contatta',
    visitStore: 'Visita Negozio', storeDescription: 'Descrizione Negozio', storeLocation: 'Posizione',
    customize: 'Personalizza', saveStore: 'Salva', cancel: 'Annulla', storeTitle: 'Nome Negozio',
    bannerImage: 'Immagine Banner', uploadBanner: 'Carica Banner', remove: 'Rimuovi',
    themeSettings: 'Impostazioni Tema', color: 'Colore', design: 'Design', customUpload: 'Caricamento Personalizzato',
    mixMatch: 'Mix & Match', preDesigned: 'Temi Predefiniti', livePreview: 'Anteprima Live',
    applyTheme: 'Applica Tema', description: 'Descrizione', noProducts: 'Nessun prodotto disponibile',
    noJobs: 'Nessuna offerta di lavoro disponibile', backToMarket: 'Torna al Mercato',
    search: 'Cerca', reviews: 'recensioni', free: 'GRATIS',
    creatorCampaigns: 'Campagne Creatori',
    affiliateCenter: 'Centro Affiliati', vendorCenter: 'Centro Venditori', buyerDashboard: 'Pannello Acquirente',
    savedItems: 'Elementi Salvati', messages: 'Messaggi', helpSupport: 'Aiuto e Supporto', tutorials: 'Tutorial',
    announcements: 'Annunci', challenges: 'Sfide', contactSupport: 'Contatta Supporto',
    termsPolicies: 'Termini e Politiche', continueBrowsing: 'Continua a Navigare', recentlyViewed: 'Visti di Recente',
    clearHistory: 'Cancella Cronologia', newProducts: 'Nuovi Prodotti', highestRanked: 'Più Votati',
    recommendedForYou: 'Consigliati Per Te', allProducts: 'Tutti i Prodotti', browseListings: 'Sfoglia Annunci',
    searchMenu: 'Cerca nel menu', noResults: 'Nessun risultato trovato', gridView: 'Vista Griglia', listView: 'Vista Lista',
  },
  ha: {
    dashboard: 'Dashboard', market: 'Kasuwa', myStore: 'Tagona', myOrders: 'Odona',
    sales: 'Sayarwa', refer: 'Kira', profile: 'Fayil', postAd: 'Talla',
    jobBoard: 'Ayyuka', myDrafts: 'Rubutuna', campaigns: 'Yaƙin neman', rewards: 'Lada', chat: 'Tattaunawa', notifications: 'Sanarwar', activityFeed: 'Kwararren Aiki', notificationPrefs: 'Saitunan Sanarwa', securityCenter: 'Cibiyar Tsaro', settings: 'Saituna', adminPanel: 'Kwamitin Admin',
    signOut: 'Fita', signIn: 'Shiga', signUp: 'Yi Rajista', language: 'Yaren',
    home: 'Gida', wallet: 'Asusun Kudi', products: 'Kayayyaki', jobs: 'Ayyuka', contact: 'Tuntubi',
    visitStore: 'Ziyarci Tago', storeDescription: 'Kwatan Tago', storeLocation: 'Wuri',
    customize: 'Saja', saveStore: 'Ajiye', cancel: 'Soke', storeTitle: 'Sunan Tago',
    bannerImage: 'Hoton Tuta', uploadBanner: 'Saja Hoto', remove: 'Cire',
    themeSettings: 'Tsarin Jigo', color: 'Launi', design: 'Tsari', customUpload: 'Saja Kai',
    mixMatch: 'Gauraya', preDesigned: 'Jigo na Shirye', livePreview: 'Duba Gaban Hoto',
    applyTheme: 'Aikawa Jigo', description: 'Kwatance', noProducts: 'Babu kayayyaki',
    noJobs: 'Babu ayyuka', backToMarket: 'Koma Kasuwa',
    search: 'Nema', reviews: 'bita', free: 'KYAUTA',
    creatorCampaigns: 'Yaƙin neman Mahalicci',
    affiliateCenter: 'Cibiyar Affiliate', vendorCenter: 'Cibiyar Masu Sayarwa', buyerDashboard: 'Dashboard na Mai Saye',
    savedItems: 'Abubuwan da aka Adana', messages: 'Saƙonni', helpSupport: 'Taimako & Gojo', tutorials: 'Koyarwa',
    announcements: 'Sanarwa', challenges: 'Kalubale', contactSupport: 'Tuntubi Taimako',
    termsPolicies: 'Sharudda & Manufa', continueBrowsing: 'Ci gaba da Bincike', recentlyViewed: 'Kwanan nan Duba',
    clearHistory: 'Share Tarihi', newProducts: 'Sabbin Kayayyaki', highestRanked: 'Mafi Girma Girma',
    recommendedForYou: 'An Ba Shawarar', allProducts: 'Dukkan Kayayyaki', browseListings: 'Bincika Sanarwar',
    searchMenu: 'Bincika menu', noResults: 'Ba a samo sakamako ba', gridView: 'Kallon Grid', listView: 'Kallon Jeri',
  },
  sw: {
    dashboard: 'Dashibodi', market: 'Soko', myStore: 'Duka Langu', myOrders: 'Maagizo Yangu',
    sales: 'Mauzo', refer: 'Pendekeza', profile: 'Wasifu', postAd: 'Tangaza',
    jobBoard: 'Kazi', myDrafts: 'Rasimu', campaigns: 'Kampeni', rewards: 'Tuzo', chat: 'Soga', notifications: 'Arifa', activityFeed: 'Mlisho wa Shughuli', notificationPrefs: 'Mipangilio ya Arifa', securityCenter: 'Kituo cha Usalama', settings: 'Mipangilio', adminPanel: 'Paneli ya Admin',
    signOut: 'Toka', signIn: 'Ingia', signUp: 'Jisajili', language: 'Lugha',
    home: 'Nyumbani', wallet: 'Pochi', products: 'Bidhaa', jobs: 'Kazi', contact: 'Wasiliana',
    visitStore: 'Tembelea Duka', storeDescription: 'Maelezo ya Duka', storeLocation: 'Eneo',
    customize: 'Badilisha', saveStore: 'Hifadhi', cancel: 'Ghairi', storeTitle: 'Jina la Duka',
    bannerImage: 'Picha ya Bango', uploadBanner: 'Pakia Bango', remove: 'Ondoa',
    themeSettings: 'Mipangilio ya Mandhari', color: 'Rangi', design: 'Muundo', customUpload: 'Pakia Mwenyewe',
    mixMatch: 'Changanya', preDesigned: 'Mandhari Tayari', livePreview: 'Muonekano',
    applyTheme: 'Tumia Mandhari', description: 'Maelezo', noProducts: 'Hakuna bidhaa',
    noJobs: 'Hakuna kazi', backToMarket: 'Rudi Sokoni',
    search: 'Tafuta', reviews: 'mapitio', free: 'BURE',
    creatorCampaigns: 'Kampeni za Wabunifu',
    affiliateCenter: 'Kituo cha Washirika', vendorCenter: 'Kituo cha Wauza', buyerDashboard: 'Dashibodi ya Mnunuzi',
    savedItems: 'Vipengee Vilivyohifadhiwa', messages: 'Ujumbe', helpSupport: 'Msaada & Usaidizi', tutorials: 'Mafunzo',
    announcements: 'Matangazo', challenges: 'Changamoto', contactSupport: 'Wasiliana na Msaada',
    termsPolicies: 'Masharti & Sera', continueBrowsing: 'Endelea Kuchunguza', recentlyViewed: 'Iliyotazama Hivi Karibuni',
    clearHistory: 'Futa Historia', newProducts: 'Bidhaa Mpya', highestRanked: 'Yenye Nafasi ya Juu',
    recommendedForYou: 'Inapendekezwa Kwako', allProducts: 'Bidhaa Zote', browseListings: 'Chunguza Orodha',
    searchMenu: 'Tafuta kwenye menyu', noResults: 'Hakuna matokeo yaliyopatikana', gridView: 'Mwonekano wa Grid', listView: 'Mwonekano wa Orodha',
  },
  id: {
    dashboard: 'Dasbor', market: 'Pasar', myStore: 'Toko Saya', myOrders: 'Pesanan Saya',
    sales: 'Penjualan', refer: 'Undang', profile: 'Profil', postAd: 'Iklan',
    jobBoard: 'Lowongan', myDrafts: 'Draf Saya', campaigns: 'Kampanye', rewards: 'Hadiah', chat: 'Obrolan', notifications: 'Notifikasi', activityFeed: 'Umpan Aktivitas', notificationPrefs: 'Pengaturan Notifikasi', securityCenter: 'Pusat Keamanan', settings: 'Pengaturan', adminPanel: 'Panel Admin',
    signOut: 'Keluar', signIn: 'Masuk', signUp: 'Daftar', language: 'Bahasa',
    home: 'Beranda', wallet: 'Dompet', products: 'Produk', jobs: 'Lowongan', contact: 'Hubungi',
    visitStore: 'Kunjungi Toko', storeDescription: 'Deskripsi Toko', storeLocation: 'Lokasi',
    customize: 'Sesuaikan', saveStore: 'Simpan Toko', cancel: 'Batal', storeTitle: 'Nama Toko',
    bannerImage: 'Gambar Banner', uploadBanner: 'Unggah Banner', remove: 'Hapus',
    themeSettings: 'Pengaturan Tema', color: 'Warna', design: 'Desain', customUpload: 'Unggahan Kustom',
    mixMatch: 'Mix & Match', preDesigned: 'Tema Siap Pakai', livePreview: 'Pratinjau Langsung',
    applyTheme: 'Terapkan Tema', description: 'Deskripsi', noProducts: 'Tidak ada produk',
    noJobs: 'Tidak ada lowongan', backToMarket: 'Kembali ke Pasar',
    search: 'Cari', reviews: 'ulasan', free: 'GRATIS',
    creatorCampaigns: 'Kampanye Kreator',
    affiliateCenter: 'Pusat Afiliasi', vendorCenter: 'Pusat Penjual', buyerDashboard: 'Dashboard Pembeli',
    savedItems: 'Item Tersimpan', messages: 'Pesan', helpSupport: 'Bantuan & Dukungan', tutorials: 'Tutorial',
    announcements: 'Pengumuman', challenges: 'Tantangan', contactSupport: 'Hubungi Dukungan',
    termsPolicies: 'Syarat & Kebijakan', continueBrowsing: 'Lanjutkan Menjelajah', recentlyViewed: 'Baru-baru ini Dilihat',
    clearHistory: 'Hapus Riwayat', newProducts: 'Produk Baru', highestRanked: 'Peringkat Tertinggi',
    recommendedForYou: 'Direkomendasikan Untuk Anda', allProducts: 'Semua Produk', browseListings: 'Jelajahi Daftar',
    searchMenu: 'Cari di menu', noResults: 'Tidak ada hasil ditemukan', gridView: 'Tampilan Grid', listView: 'Tampilan Daftar',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (code: string) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'dright-language';

function detectInitialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const found = LANGUAGES.find(l => l.code === stored);
    if (found) return found;
  }
  return LANGUAGES[0];
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => detectInitialLanguage());

  const setLanguage = (code: string) => {
    const found = LANGUAGES.find(l => l.code === code);
    if (!found) return;
    setLanguageState(found);
    localStorage.setItem(STORAGE_KEY, code);
    document.documentElement.lang = code;
    if (code === 'ar') {
      document.documentElement.dir = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
    }
  };

  useEffect(() => {
    document.documentElement.lang = language.code;
    document.documentElement.dir = language.code === 'ar' ? 'rtl' : 'ltr';
  }, [language.code]);

  const t = (key: TranslationKey): string => {
    const translations = TRANSLATIONS[language.code] || TRANSLATIONS.en;
    return translations[key] || TRANSLATIONS.en[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
