class DjController < ApplicationController
  def index
    @videos = Video.all
    @current_video = @videos.first
    @next_video = @videos.second
  end
end
