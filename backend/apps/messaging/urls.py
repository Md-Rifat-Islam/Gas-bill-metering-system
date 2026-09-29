from django.urls import path
from . import views

urlpatterns = [
    path('access/',              views.MessagingAccessView.as_view()),
    path('overview/',            views.OverviewView.as_view()),
    path('settings/',            views.SettingsView.as_view()),
    path('reminders/preview/',   views.ReminderPreviewView.as_view()),
    path('templates/',           views.TemplateListCreateView.as_view()),
    path('templates/<int:pk>/',  views.TemplateDetailView.as_view()),
    path('messages/',            views.MessageListView.as_view()),
    path('messages/<int:pk>/retry/', views.MessageRetryView.as_view()),
    path('test/',                views.TestSendView.as_view()),
    path('campaigns/',           views.CampaignView.as_view()),
]